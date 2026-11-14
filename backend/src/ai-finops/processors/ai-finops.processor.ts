import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AiFinopsConnection } from '../../db/entites/ai-finops-connection.entity';
import { AiFinopsProviderSync } from '../../db/entites/ai-finops-provider-sync.entity';
import {
    AI_FINOPS_JOB_NAME,
    AI_FINOPS_QUEUE,
    AI_FINOPS_WORKER_CONCURRENCY,
    type AiFinopsSyncJobPayload,
} from '../constants';
import { AiFinopsAdapterRegistry } from '../providers/adapter.registry';
import { AiFinopsConnectionService } from '../services/ai-finops-connection.service';
import { AiFinopsPricingService } from '../services/ai-finops-pricing.service';
import { AiFinopsProviderUserService } from '../services/ai-finops-provider-user.service';
import { AiFinopsUsageService } from '../services/ai-finops-usage.service';

@Processor(AI_FINOPS_QUEUE, { concurrency: AI_FINOPS_WORKER_CONCURRENCY })
export class AiFinopsProcessor extends WorkerHost {
    private readonly logger = new Logger(AiFinopsProcessor.name);

    constructor(
        @InjectRepository(AiFinopsConnection)
        private readonly connectionRepository: Repository<AiFinopsConnection>,
        @InjectRepository(AiFinopsProviderSync)
        private readonly syncRepository: Repository<AiFinopsProviderSync>,
        private readonly connectionService: AiFinopsConnectionService,
        private readonly adapters: AiFinopsAdapterRegistry,
        private readonly pricing: AiFinopsPricingService,
        private readonly usage: AiFinopsUsageService,
        private readonly providerUsers: AiFinopsProviderUserService,
    ) {
        super();
    }

    async process(job: Job<AiFinopsSyncJobPayload>): Promise<void> {
        if (job.name !== AI_FINOPS_JOB_NAME) return;

        const { tenantId, connectionId, syncRunId, syncType, startDate, endDate } = job.data;
        const syncRun = await this.syncRepository.findOne({ where: { id: syncRunId, tenantId } });
        const connection = await this.connectionRepository.findOne({ where: { id: connectionId, tenantId } });
        if (!syncRun || !connection) {
            this.logger.warn(`sync skipped missing sync/connection ${syncRunId}/${connectionId}`);
            return;
        }

        syncRun.status = 'running';
        syncRun.startedAt = new Date();
        await this.syncRepository.save(syncRun);

        let processed = 0;
        try {
            const adapter = this.adapters.get(connection.providerSlug);
            if (!adapter) {
                throw new Error(`Adapter missing for ${connection.providerSlug}`);
            }

            const creds = await this.connectionService.decryptConnectionCredentials(connectionId, tenantId);

            if (adapter.listUsers) {
                const users = await adapter.listUsers(creds);
                const upserted = await this.providerUsers.upsertMany({
                    tenantId,
                    connectionId: connection.id,
                    provider: connection.providerSlug,
                    users,
                });
                processed += upserted;
            }

            if (adapter.capabilities.listModels) {
                const models = await adapter.listModels(creds);
                for (const model of models) {
                    await this.pricing.upsertModel({
                        providerId: connection.providerId,
                        modelIdentifier: model.modelIdentifier,
                        displayName: model.displayName,
                        modality: model.modality,
                        contextWindow: model.contextWindow,
                        capabilities: model.capabilities,
                    });
                    processed += 1;
                }
                connection.modelsCount = models.length;
            }

            const end = endDate ?? new Date().toISOString().slice(0, 10);
            const start =
                startDate ??
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            let usageRows = 0;
            const usageUserIds = new Set<string>();
            if (adapter.capabilities.fetchUsage && adapter.fetchUsage) {
                const entries = await adapter.fetchUsage(creds, start, end);
                for (const entry of entries) {
                    if (entry.userExternalId) usageUserIds.add(entry.userExternalId);
                    await this.usage.ingest({
                        tenantId,
                        organizationId: connection.organizationId,
                        connectionId: connection.id,
                        provider: connection.providerSlug,
                        providerAccountId: connection.providerAccountId,
                        providerProjectId: connection.providerProjectId,
                        providerUserExternalId: entry.userExternalId ?? null,
                        model: entry.model,
                        providerRequestId: entry.providerRequestId ?? null,
                        inputTokens: entry.inputTokens,
                        outputTokens: entry.outputTokens,
                        cachedInputTokens: entry.cachedInputTokens,
                        reasoningTokens: entry.reasoningTokens,
                        otherTokens: entry.otherTokens,
                        totalTokens: entry.totalTokens,
                        officialCost: entry.officialCost ?? null,
                        currency: entry.currency ?? 'USD',
                        usageSource: 'provider_admin',
                        occurredAt: entry.occurredAt,
                        metadata: entry.metadata ?? {},
                    });
                    processed += 1;
                    usageRows += 1;
                }
            } else if (adapter.capabilities.fetchCosts && adapter.fetchCosts) {
                const costs = await adapter.fetchCosts(creds, start, end);
                for (const [index, cost] of costs.entries()) {
                    if (cost.userExternalId) usageUserIds.add(cost.userExternalId);
                    await this.usage.ingest({
                        tenantId,
                        organizationId: connection.organizationId,
                        connectionId: connection.id,
                        provider: connection.providerSlug,
                        providerAccountId: connection.providerAccountId,
                        providerProjectId: connection.providerProjectId,
                        providerUserExternalId: cost.userExternalId ?? null,
                        model: cost.model ?? connection.providerSlug,
                        providerRequestId: `${connection.providerSlug}-cost-${cost.date}-${index}-${cost.userExternalId ?? 'na'}`,
                        inputTokens: 0,
                        outputTokens: 0,
                        totalTokens: 0,
                        officialCost: cost.cost,
                        currency: cost.currency,
                        usageSource: 'provider_admin',
                        occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                        metadata: cost.metadata ?? {},
                    });
                    processed += 1;
                    usageRows += 1;
                }
            }

            // Also resolve ids already stored on daily usage for this connection.
            // A re-sync can return an empty cost window while historical rows still need labels.
            for (const existingId of await this.usage.listProviderUserExternalIds(
                tenantId,
                connection.id,
            )) {
                usageUserIds.add(existingId);
            }

            if (usageUserIds.size > 0) {
                let known = await this.providerUsers.resolveLabels(tenantId, Array.from(usageUserIds));
                let missing = Array.from(usageUserIds).filter((id) => !known.has(id));

                if (adapter.resolveUsersByIds && missing.length > 0) {
                    this.logger.log(
                        `ai-finops resolving ${missing.length} unmatched provider user id(s) for connection=${connectionId}`,
                    );
                    const resolved = await adapter.resolveUsersByIds(creds, missing);
                    processed += await this.providerUsers.upsertMany({
                        tenantId,
                        connectionId: connection.id,
                        provider: connection.providerSlug,
                        users: resolved,
                    });
                    known = await this.providerUsers.resolveLabels(tenantId, Array.from(usageUserIds));
                    missing = Array.from(usageUserIds).filter((id) => !known.has(id));
                }

                // OpenAI sometimes emits a costs/usage user_id that differs from organization.users.id.
                // When the connection has a single named directory user and a single unmatched usage id,
                // alias them so FinOps can show the human name.
                if (missing.length === 1) {
                    const named = await this.providerUsers.listNamedUsers(
                        tenantId,
                        connection.providerSlug,
                        connection.id,
                    );
                    const uniqueNamed = Array.from(
                        new Map(
                            named.map((row) => [
                                `${row.name ?? ''}|${row.email ?? ''}`,
                                row,
                            ]),
                        ).values(),
                    );
                    if (uniqueNamed.length === 1) {
                        const only = uniqueNamed[0];
                        processed += await this.providerUsers.upsertMany({
                            tenantId,
                            connectionId: connection.id,
                            provider: connection.providerSlug,
                            users: [
                                {
                                    externalId: missing[0],
                                    name: only.name,
                                    email: only.email,
                                    role: only.role,
                                    metadata: {
                                        source: 'provider_user_single_match_alias',
                                        aliasOf: only.externalId,
                                    },
                                },
                            ],
                        });
                        missing = [];
                    }
                }

                if (missing.length > 0) {
                    this.logger.warn(
                        `ai-finops unresolved provider user ids connection=${connectionId}: ${missing.join(', ')}`,
                    );
                }
            }

            connection.lastSyncAt = new Date();
            connection.lastSyncStatus = 'completed';
            const canFetchSpend = adapter.capabilities.fetchUsage || adapter.capabilities.fetchCosts;
            connection.status = canFetchSpend && usageRows > 0 ? 'active' : canFetchSpend ? 'partial' : 'partial';
            connection.statusMessage =
                canFetchSpend && usageRows > 0
                    ? null
                    : canFetchSpend
                      ? 'Models synced. Admin usage/costs returned no rows for this period or key scope.'
                      : 'Provider admin usage/cost sync is not available for this credential type. Models were synced; Gateway usage will appear when applications call the AI Gateway.';
            await this.connectionRepository.save(connection);

            syncRun.status = 'completed';
            syncRun.finishedAt = new Date();
            syncRun.recordsProcessed = processed;
            syncRun.metadata = { ...(syncRun.metadata ?? {}), syncType };
            await this.syncRepository.save(syncRun);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown sync error';
            this.logger.error(`ai-finops sync failed connection=${connectionId}: ${message}`);
            connection.lastSyncAt = new Date();
            connection.lastSyncStatus = 'failed';
            connection.status = 'error';
            connection.statusMessage = 'Sync failed. Credentials were not logged.';
            await this.connectionRepository.save(connection);

            syncRun.status = 'failed';
            syncRun.finishedAt = new Date();
            syncRun.recordsProcessed = processed;
            syncRun.errorMessage = message;
            await this.syncRepository.save(syncRun);
            throw error;
        }
    }
}
