import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Job } from 'bullmq';

import { GovernanceJob } from '../../db/entites/governance-job.entity';

import { GovernanceScanService } from '../services/governance-scan.service';
import { OrgKnowledgeRulesService } from '../services/org-knowledge-rules.service';
import { GovernanceRecommendationBridgeService } from '../services/governance-recommendation-bridge.service';

import { GOVERNANCE_QUEUE, GOVERNANCE_WORKER_CONCURRENCY } from '../constants';

export interface GovernanceJobPayload {
    jobId: string;
    cloudAccountId: string;
    organizationId: string;
    provider: string;
}

@Processor(GOVERNANCE_QUEUE, { concurrency: GOVERNANCE_WORKER_CONCURRENCY })
export class GovernanceProcessor extends WorkerHost {
    private readonly logger = new Logger(GovernanceProcessor.name);

    constructor(
        @InjectRepository(GovernanceJob)
        private readonly jobRepo: Repository<GovernanceJob>,

        private readonly scanService: GovernanceScanService,
        private readonly orgKnowledgeRulesService: OrgKnowledgeRulesService,
        private readonly recommendationBridge: GovernanceRecommendationBridgeService,
    ) {
        super();
    }

    async process(job: Job<GovernanceJobPayload>): Promise<void> {
        const { jobId, cloudAccountId, organizationId, provider } = job.data;

        this.logger.log(`[${jobId}] Iniciando scan de governança ${provider.toUpperCase()} para conta ${cloudAccountId}`);

        await this.jobRepo.update(jobId, { status: 'running' });

        try {
            // ── 1. Carregar recursos e supressões ───────────────────────────
            this.logger.log(`[${jobId}] Fase 1/4: Carregando recursos ${provider.toUpperCase()} e supressões...`);

            await job.updateProgress(10);

            const [resources, suppressions, orgRules] = await Promise.all([
                this.scanService.loadResources(cloudAccountId, provider),
                this.scanService.loadSuppressions(cloudAccountId, organizationId),
                this.orgKnowledgeRulesService.getOrgRules(organizationId, cloudAccountId),
            ]);

            this.logger.log(`[${jobId}] ${suppressions.length} supressão(ões) ativa(s) encontrada(s).`);
            if (orgRules.requiredTags.length > 0) {
                this.logger.log(
                    `[${jobId}] Regras de tags da knowledge base: ${orgRules.requiredTags.join(', ')}`,
                );
            } else {
                this.logger.warn(
                    `[${jobId}] Nenhuma regra de tags encontrada na knowledge base — usando defaults das policies`,
                );
            }
            if (orgRules.namingPatterns.length > 0) {
                this.logger.log(
                    `[${jobId}] Regras de nomenclatura da knowledge base: ${orgRules.namingPatterns
                        .map((item) => item.pattern)
                        .join(', ')}`,
                );
            }

            // ── 2. Avaliar políticas ────────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 2/4: Avaliando políticas de governança ${provider.toUpperCase()}...`);

            await job.updateProgress(40);

            const context = {
                cloudAccountId,
                organizationId,
                orgRules: {
                    requiredTags: orgRules.requiredTags,
                    requiredTagProviders: orgRules.requiredTagProviders,
                    requiredTagResourceTypes: orgRules.requiredTagResourceTypes,
                    namingPatterns: orgRules.namingPatterns,
                },
            };

            const { findings, score, totalChecks, totalNonCompliant, totalSuppressed } = this.scanService.evaluatePolicies(
                resources,
                context,
                provider,
                suppressions
            );

            // ── 3. Persistir findings ───────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 3/5: Salvando ${totalNonCompliant} achados não-conformes (${totalSuppressed} suprimidos)...`);

            await job.updateProgress(60);

            await this.scanService.saveFindings(jobId, cloudAccountId, organizationId, findings);

            // ── 4. Upsert recomendações CI ───────────────────────────────────
            this.logger.log(`[${jobId}] Fase 4/5: Upsert de recomendações no Cloud Intelligence...`);
            await job.updateProgress(80);
            try {
                const { upserted } = await this.recommendationBridge.upsertFromJob(
                    jobId,
                    organizationId,
                );
                this.logger.log(`[${jobId}] ${upserted} recomendação(ões) sincronizada(s).`);
            } catch (bridgeError) {
                // Findings already saved — do not fail the governance job if CI bridge fails.
                this.logger.warn(
                    `[${jobId}] Bridge de recomendações falhou: ${
                        bridgeError instanceof Error ? bridgeError.message : String(bridgeError)
                    }`,
                );
            }

            // ── 5. Finalizar job ────────────────────────────────────────────
            this.logger.log(`[${jobId}] Fase 5/5: Finalizando job (score=${score})...`);

            await job.updateProgress(90);

            await this.jobRepo
                .createQueryBuilder()
                .update(GovernanceJob)
                .set({
                    status: 'completed',
                    score,
                    totalFindings: totalNonCompliant,
                    totalChecks,
                    // DB NOW() avoids JS Date ↔ TIMESTAMP timezone skew on completed_at.
                    completedAt: () => 'NOW()',
                })
                .where('id = :jobId', { jobId })
                .execute();

            await job.updateProgress(100);

            this.logger.log(
                `[${jobId}] Scan ${provider.toUpperCase()} concluído: score=${score}, checks=${totalChecks}, ` +
                    `findings=${totalNonCompliant}, suppressed=${totalSuppressed}`
            );
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);

            this.logger.error(`[${jobId}] Scan de governança falhou: ${error}`);

            await this.jobRepo.update(jobId, { status: 'failed', error });

            throw err;
        }
    }
}
