import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiRecommendation } from '../../db/entites/ai-recommendation.entity';
import { GovernanceFinding } from '../../db/entites/governance-finding.entity';
import { mapGovernanceFindingToRecommendation } from '../../cloud-intelligence/recommendations/governance-finding-recommendation.mapper';

const ACTIVE_STATUSES = ['NEW', 'REVIEWING', 'APPROVED', 'EXECUTING'] as const;

/**
 * Upserts Cloud Intelligence recommendations from governance findings without
 * importing CloudIntelligenceModule (avoids Nest circular dependency).
 */
@Injectable()
export class GovernanceRecommendationBridgeService {
    private readonly logger = new Logger(GovernanceRecommendationBridgeService.name);

    constructor(
        @InjectRepository(GovernanceFinding)
        private readonly findingRepository: Repository<GovernanceFinding>,
        @InjectRepository(AiRecommendation)
        private readonly recommendationRepository: Repository<AiRecommendation>,
    ) {}

    async upsertFromJob(jobId: string, organizationId: string): Promise<{ upserted: number }> {
        const findings = await this.findingRepository.find({
            where: {
                jobId,
                organizationId,
                status: In(['non_compliant', 'warning']),
            },
            order: { createdAt: 'DESC' },
            take: 500,
        });

        if (findings.length === 0) {
            return { upserted: 0 };
        }

        let upserted = 0;
        for (const finding of findings) {
            if (!finding.resourceId || !finding.cloudAccountId || !finding.policyId) {
                continue;
            }

            const payload = mapGovernanceFindingToRecommendation(finding);
            const existing = await this.recommendationRepository.findOne({
                where: {
                    organizationId,
                    dedupeKey: payload.dedupeKey,
                    status: In([...ACTIVE_STATUSES]),
                },
            });

            if (existing) {
                existing.title = payload.title.slice(0, 300);
                existing.description = payload.description;
                existing.severity = payload.severity;
                existing.priority = payload.priority;
                existing.evidence = payload.evidence;
                existing.resourceReference = {
                    ...(existing.resourceReference ?? {}),
                    ...payload.resourceReference,
                };
                existing.estimatedImpact = payload.estimatedImpact;
                existing.confidence = payload.confidence;
                existing.category = payload.category;
                existing.agentType = payload.agentType;
                await this.recommendationRepository.save(existing);
            } else {
                await this.recommendationRepository.save(
                    this.recommendationRepository.create({
                        organizationId: payload.organizationId,
                        userId: null,
                        agentType: payload.agentType,
                        category: payload.category,
                        title: payload.title.slice(0, 300),
                        description: payload.description,
                        severity: payload.severity,
                        priority: payload.priority,
                        evidence: payload.evidence,
                        resourceReference: payload.resourceReference,
                        estimatedImpact: payload.estimatedImpact,
                        confidence: payload.confidence,
                        status: 'NEW',
                        dedupeKey: payload.dedupeKey,
                    }),
                );
            }
            upserted += 1;
        }

        this.logger.log(
            `[${jobId}] Bridge governance→recommendations: ${upserted} upsert(s) from ${findings.length} finding(s)`,
        );
        return { upserted };
    }
}
