import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsUsageDaily } from '../../db/entites/ai-finops-usage-daily.entity';
import { AiFinopsUsageRecord } from '../../db/entites/ai-finops-usage-record.entity';
import type { DashboardQueryDto, ExplorerQueryDto, UsageQueryDto } from '../dto';
import { AiFinopsProviderUserService } from './ai-finops-provider-user.service';

export type IngestUsageInput = {
    tenantId: string;
    organizationId: string;
    connectionId: string | null;
    provider: string;
    providerAccountId?: string | null;
    providerProjectId?: string | null;
    userId?: string | null;
    providerUserExternalId?: string | null;
    teamId?: string | null;
    applicationId?: string | null;
    model: string;
    requestId?: string | null;
    providerRequestId?: string | null;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    otherTokens?: number;
    totalTokens: number;
    estimatedCost?: number | null;
    officialCost?: number | null;
    currency?: string;
    latencyMs?: number | null;
    status?: 'success' | 'error' | 'partial' | 'pending_reconciliation';
    usageSource: 'provider_admin' | 'gateway';
    occurredAt: Date;
    metadata?: Record<string, unknown>;
};

@Injectable()
export class AiFinopsUsageService {
    constructor(
        @InjectRepository(AiFinopsUsageRecord)
        private readonly usageRepository: Repository<AiFinopsUsageRecord>,
        @InjectRepository(AiFinopsUsageDaily)
        private readonly dailyRepository: Repository<AiFinopsUsageDaily>,
        private readonly providerUsers: AiFinopsProviderUserService,
    ) {}

    async listProviderUserExternalIds(
        tenantId: string,
        connectionId: string,
    ): Promise<string[]> {
        const rows = await this.dailyRepository
            .createQueryBuilder('daily')
            .select('DISTINCT daily.provider_user_external_id', 'providerUserExternalId')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.connection_id = :connectionId', { connectionId })
            .andWhere('daily.provider_user_external_id IS NOT NULL')
            .getRawMany<{ providerUserExternalId: string }>();

        return rows
            .map((row) => row.providerUserExternalId?.trim())
            .filter((id): id is string => Boolean(id));
    }

    async ingest(input: IngestUsageInput): Promise<AiFinopsUsageRecord | null> {
        if (input.providerRequestId && input.connectionId) {
            const existing = await this.usageRepository.findOne({
                where: {
                    connectionId: input.connectionId,
                    providerRequestId: input.providerRequestId,
                },
            });
            if (existing) return existing;
        }

        const record = await this.usageRepository.save(
            this.usageRepository.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                connectionId: input.connectionId,
                provider: input.provider,
                providerAccountId: input.providerAccountId ?? null,
                providerProjectId: input.providerProjectId ?? null,
                userId: input.userId ?? null,
                providerUserExternalId: input.providerUserExternalId ?? null,
                teamId: input.teamId ?? null,
                applicationId: input.applicationId ?? null,
                model: input.model,
                requestId: input.requestId ?? null,
                providerRequestId: input.providerRequestId ?? null,
                inputTokens: String(input.inputTokens),
                outputTokens: String(input.outputTokens),
                cachedInputTokens: String(input.cachedInputTokens ?? 0),
                reasoningTokens: String(input.reasoningTokens ?? 0),
                otherTokens: String(input.otherTokens ?? 0),
                totalTokens: String(input.totalTokens),
                estimatedCost: input.estimatedCost != null ? String(input.estimatedCost) : null,
                officialCost: input.officialCost != null ? String(input.officialCost) : null,
                currency: input.currency ?? 'USD',
                latencyMs: input.latencyMs ?? null,
                status: input.status ?? 'success',
                usageSource: input.usageSource,
                occurredAt: input.occurredAt,
                metadata: input.metadata ?? {},
            }),
        );

        await this.rollupDaily(record);
        return record;
    }

    private usageDate(occurredAt: Date): string {
        return occurredAt.toISOString().slice(0, 10);
    }

    private async rollupDaily(record: AiFinopsUsageRecord): Promise<void> {
        const usageDate = this.usageDate(record.occurredAt);
        const dailyQb = this.dailyRepository
            .createQueryBuilder('daily')
            .where('daily.tenant_id = :tenantId', { tenantId: record.tenantId })
            .andWhere('daily.organization_id = :organizationId', { organizationId: record.organizationId })
            .andWhere('daily.provider = :provider', { provider: record.provider })
            .andWhere('daily.model = :model', { model: record.model })
            .andWhere('daily.usage_source = :usageSource', { usageSource: record.usageSource })
            .andWhere('daily.usage_date = :usageDate', { usageDate });

        if (record.connectionId) {
            dailyQb.andWhere('daily.connection_id = :connectionId', { connectionId: record.connectionId });
        } else {
            dailyQb.andWhere('daily.connection_id IS NULL');
        }
        if (record.applicationId) {
            dailyQb.andWhere('daily.application_id = :applicationId', { applicationId: record.applicationId });
        } else {
            dailyQb.andWhere('daily.application_id IS NULL');
        }
        if (record.userId) {
            dailyQb.andWhere('daily.user_id = :userId', { userId: record.userId });
        } else {
            dailyQb.andWhere('daily.user_id IS NULL');
        }
        if (record.providerUserExternalId) {
            dailyQb.andWhere('daily.provider_user_external_id = :providerUserExternalId', {
                providerUserExternalId: record.providerUserExternalId,
            });
        } else {
            dailyQb.andWhere('daily.provider_user_external_id IS NULL');
        }
        if (record.teamId) {
            dailyQb.andWhere('daily.team_id = :teamId', { teamId: record.teamId });
        } else {
            dailyQb.andWhere('daily.team_id IS NULL');
        }

        let daily = await dailyQb.getOne();

        if (!daily) {
            daily = this.dailyRepository.create({
                tenantId: record.tenantId,
                organizationId: record.organizationId,
                connectionId: record.connectionId,
                provider: record.provider,
                applicationId: record.applicationId,
                userId: record.userId,
                providerUserExternalId: record.providerUserExternalId,
                teamId: record.teamId,
                model: record.model,
                usageSource: record.usageSource,
                usageDate,
                inputTokens: '0',
                outputTokens: '0',
                totalTokens: '0',
                estimatedCost: '0',
                officialCost: '0',
                currency: record.currency,
                requestCount: 0,
            });
        }

        daily.inputTokens = String(Number(daily.inputTokens) + Number(record.inputTokens));
        daily.outputTokens = String(Number(daily.outputTokens) + Number(record.outputTokens));
        daily.totalTokens = String(Number(daily.totalTokens) + Number(record.totalTokens));
        daily.estimatedCost = String(Number(daily.estimatedCost) + Number(record.estimatedCost ?? 0));
        daily.officialCost = String(Number(daily.officialCost) + Number(record.officialCost ?? 0));
        daily.requestCount += 1;
        await this.dailyRepository.save(daily);
    }

    private resolveDateRange(query: { startDate?: string; endDate?: string }) {
        const end = query.endDate ?? new Date().toISOString().slice(0, 10);
        const start =
            query.startDate ??
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        return { start, end };
    }

    private resolveConnectionIds(query: {
        connectionId?: string;
        connectionIds?: string[];
    }): string[] {
        const ids = [
            ...(query.connectionIds ?? []),
            ...(query.connectionId ? [query.connectionId] : []),
        ];
        return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    }

    private applyConnectionFilter(
        qb: { andWhere: (where: string, parameters?: Record<string, unknown>) => unknown },
        alias: string,
        query: { connectionId?: string; connectionIds?: string[] },
    ): void {
        const ids = this.resolveConnectionIds(query);
        if (ids.length === 1) {
            qb.andWhere(`${alias}.connection_id = :connectionId`, { connectionId: ids[0] });
            return;
        }
        if (ids.length > 1) {
            qb.andWhere(`${alias}.connection_id IN (:...connectionIds)`, { connectionIds: ids });
        }
    }

    private resolveProviderUserExternalIds(query: {
        providerUserExternalIds?: string[];
    }): string[] {
        return Array.from(
            new Set(
                (query.providerUserExternalIds ?? [])
                    .map((id) => id.trim())
                    .filter(Boolean),
            ),
        );
    }

    private applyProviderUserFilter(
        qb: { andWhere: (where: string, parameters?: Record<string, unknown>) => unknown },
        alias: string,
        query: { providerUserExternalIds?: string[] },
    ): void {
        const ids = this.resolveProviderUserExternalIds(query);
        if (ids.length === 1) {
            qb.andWhere(`${alias}.provider_user_external_id = :providerUserExternalId`, {
                providerUserExternalId: ids[0],
            });
            return;
        }
        if (ids.length > 1) {
            qb.andWhere(`${alias}.provider_user_external_id IN (:...providerUserExternalIds)`, {
                providerUserExternalIds: ids,
            });
        }
    }

    async listUsersForFilter(tenantId: string, query: DashboardQueryDto) {
        const { start, end } = this.resolveDateRange(query);
        const qb = this.dailyRepository
            .createQueryBuilder('daily')
            .select('DISTINCT daily.provider_user_external_id', 'externalId')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.usage_date >= :start', { start })
            .andWhere('daily.usage_date <= :end', { end })
            .andWhere('daily.provider_user_external_id IS NOT NULL');

        if (query.midOrganizationId) {
            qb.andWhere('daily.organization_id = :organizationId', {
                organizationId: query.midOrganizationId,
            });
        }
        this.applyConnectionFilter(qb, 'daily', query);

        const rows = await qb.getRawMany<{ externalId: string }>();
        const externalIds = rows
            .map((row) => row.externalId?.trim())
            .filter((id): id is string => Boolean(id));
        const labels = await this.providerUsers.resolveLabels(tenantId, externalIds);

        return externalIds
            .map((externalId) => ({
                externalId,
                label: this.providerUsers.labelFor(externalId, labels),
            }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    }

    async listUsage(tenantId: string, query: UsageQueryDto) {
        const { start, end } = this.resolveDateRange(query);
        const qb = this.usageRepository
            .createQueryBuilder('usage')
            .where('usage.tenant_id = :tenantId', { tenantId })
            .andWhere('usage.occurred_at >= :start', { start: `${start}T00:00:00.000Z` })
            .andWhere('usage.occurred_at <= :end', { end: `${end}T23:59:59.999Z` })
            .orderBy('usage.occurred_at', 'DESC');

        if (query.midOrganizationId) {
            qb.andWhere('usage.organization_id = :organizationId', { organizationId: query.midOrganizationId });
        }
        this.applyConnectionFilter(qb, 'usage', query);
        this.applyProviderUserFilter(qb, 'usage', query);
        if (query.provider) qb.andWhere('usage.provider = :provider', { provider: query.provider });
        if (query.model) qb.andWhere('usage.model = :model', { model: query.model });
        if (query.userId) qb.andWhere('usage.user_id = :userId', { userId: query.userId });
        if (query.teamId) qb.andWhere('usage.team_id = :teamId', { teamId: query.teamId });
        if (query.applicationId) qb.andWhere('usage.application_id = :applicationId', { applicationId: query.applicationId });
        if (query.usageSource) qb.andWhere('usage.usage_source = :usageSource', { usageSource: query.usageSource });

        const page = query.page ?? 1;
        const limit = query.limit ?? 25;
        const [items, totalItems] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));
        const labels = await this.providerUsers.resolveLabels(
            tenantId,
            items.map((item) => item.providerUserExternalId ?? item.userId ?? '').filter(Boolean),
        );
        return {
            items: items.map((item) => {
                const key = item.providerUserExternalId ?? item.userId ?? null;
                return {
                    ...item,
                    userDisplayName: key ? this.providerUsers.labelFor(key, labels) : null,
                };
            }),
            pagination: {
                page,
                limit,
                totalItems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    async dashboard(tenantId: string, query: DashboardQueryDto) {
        const { start, end } = this.resolveDateRange(query);
        const qb = this.dailyRepository
            .createQueryBuilder('daily')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.usage_date >= :start', { start })
            .andWhere('daily.usage_date <= :end', { end });

        if (query.midOrganizationId) {
            qb.andWhere('daily.organization_id = :organizationId', { organizationId: query.midOrganizationId });
        }
        this.applyConnectionFilter(qb, 'daily', query);
        this.applyProviderUserFilter(qb, 'daily', query);
        if (query.provider) qb.andWhere('daily.provider = :provider', { provider: query.provider });

        const rows = await qb.getMany();

        const bySource = {
            provider_admin: { officialCost: 0, estimatedCost: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
            gateway: { officialCost: 0, estimatedCost: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        };
        const byDay = new Map<string, { officialCost: number; estimatedCost: number; totalTokens: number }>();
        const byProvider = new Map<string, { officialCost: number; estimatedCost: number; totalTokens: number }>();
        const byModel = new Map<string, { officialCost: number; estimatedCost: number; totalTokens: number }>();

        for (const row of rows) {
            const source = row.usageSource === 'gateway' ? 'gateway' : 'provider_admin';
            const bucket = bySource[source];
            bucket.officialCost += Number(row.officialCost);
            bucket.estimatedCost += Number(row.estimatedCost);
            bucket.inputTokens += Number(row.inputTokens);
            bucket.outputTokens += Number(row.outputTokens);
            bucket.totalTokens += Number(row.totalTokens);
            bucket.requestCount += row.requestCount;

            const day = byDay.get(row.usageDate) ?? { officialCost: 0, estimatedCost: 0, totalTokens: 0 };
            day.officialCost += Number(row.officialCost);
            day.estimatedCost += Number(row.estimatedCost);
            day.totalTokens += Number(row.totalTokens);
            byDay.set(row.usageDate, day);

            const provider = byProvider.get(row.provider) ?? { officialCost: 0, estimatedCost: 0, totalTokens: 0 };
            provider.officialCost += Number(row.officialCost);
            provider.estimatedCost += Number(row.estimatedCost);
            provider.totalTokens += Number(row.totalTokens);
            byProvider.set(row.provider, provider);

            const model = byModel.get(row.model) ?? { officialCost: 0, estimatedCost: 0, totalTokens: 0 };
            model.officialCost += Number(row.officialCost);
            model.estimatedCost += Number(row.estimatedCost);
            model.totalTokens += Number(row.totalTokens);
            byModel.set(row.model, model);
        }

        return {
            period: { start, end },
            note: 'Official provider costs and Gateway estimated costs are reported separately and are never summed automatically.',
            bySource,
            totals: {
                officialCost: bySource.provider_admin.officialCost,
                estimatedGatewayCost: bySource.gateway.estimatedCost,
                inputTokens: bySource.provider_admin.inputTokens + bySource.gateway.inputTokens,
                outputTokens: bySource.provider_admin.outputTokens + bySource.gateway.outputTokens,
                totalTokens: bySource.provider_admin.totalTokens + bySource.gateway.totalTokens,
                requestCount: bySource.provider_admin.requestCount + bySource.gateway.requestCount,
                activeModels: byModel.size,
            },
            series: {
                daily: Array.from(byDay.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, value]) => ({ date, ...value })),
                byProvider: Array.from(byProvider.entries()).map(([provider, value]) => ({ provider, ...value })),
                byModel: Array.from(byModel.entries())
                    .map(([model, value]) => ({ model, ...value }))
                    .sort((a, b) => b.officialCost + b.estimatedCost - (a.officialCost + a.estimatedCost))
                    .slice(0, 20),
            },
        };
    }

    async explore(tenantId: string, query: ExplorerQueryDto) {
        const { start, end } = this.resolveDateRange(query);
        const groupBy = query.groupBy ?? 'provider';
        const qb = this.dailyRepository
            .createQueryBuilder('daily')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.usage_date >= :start', { start })
            .andWhere('daily.usage_date <= :end', { end });

        if (query.midOrganizationId) {
            qb.andWhere('daily.organization_id = :organizationId', { organizationId: query.midOrganizationId });
        }
        this.applyConnectionFilter(qb, 'daily', query);
        this.applyProviderUserFilter(qb, 'daily', query);
        if (query.provider) qb.andWhere('daily.provider = :provider', { provider: query.provider });

        const rows = await qb.getMany();
        const grouped = new Map<string, { officialCost: number; estimatedCost: number; totalTokens: number; requestCount: number }>();

        for (const row of rows) {
            let key = row.provider;
            if (groupBy === 'model') key = row.model;
            else if (groupBy === 'user') {
                key = row.providerUserExternalId ?? row.userId ?? 'unknown';
            }
            else if (groupBy === 'team') key = row.teamId ?? 'unknown';
            else if (groupBy === 'application') key = row.applicationId ?? 'unknown';
            else if (groupBy === 'day') key = row.usageDate;
            else if (groupBy === 'month') key = row.usageDate.slice(0, 7);

            const bucket = grouped.get(key) ?? { officialCost: 0, estimatedCost: 0, totalTokens: 0, requestCount: 0 };
            bucket.officialCost += Number(row.officialCost);
            bucket.estimatedCost += Number(row.estimatedCost);
            bucket.totalTokens += Number(row.totalTokens);
            bucket.requestCount += row.requestCount;
            grouped.set(key, bucket);
        }

        const items = Array.from(grouped.entries())
            .map(([key, value]) => ({ key, ...value }))
            .sort((a, b) => b.officialCost + b.estimatedCost - (a.officialCost + a.estimatedCost));

        if (groupBy === 'user') {
            const labels = await this.providerUsers.resolveLabels(
                tenantId,
                items.map((item) => item.key),
            );
            return {
                period: { start, end },
                groupBy,
                note: 'Values keep official and estimated costs separate.',
                items: items.map((item) => ({
                    ...item,
                    label: this.providerUsers.labelFor(item.key, labels),
                })),
            };
        }

        return {
            period: { start, end },
            groupBy,
            note: 'Values keep official and estimated costs separate.',
            items,
        };
    }

    async executiveOverview(tenantId: string, query: DashboardQueryDto) {
        const dashboard = await this.dashboard(tenantId, query);
        const topConsumers = await this.explore(tenantId, { ...query, groupBy: 'user' });
        const topModels = await this.explore(tenantId, { ...query, groupBy: 'model' });
        const topProviders = await this.explore(tenantId, { ...query, groupBy: 'provider' });
        return {
            period: dashboard.period,
            note: dashboard.note,
            totals: dashboard.totals,
            topConsumers: topConsumers.items.slice(0, 10),
            topModels: topModels.items.slice(0, 10),
            topProviders: topProviders.items.slice(0, 10),
            series: dashboard.series,
        };
    }

    async monthOverMonth(tenantId: string, midOrganizationId?: string) {
        const now = new Date();
        const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
            .toISOString()
            .slice(0, 10);
        const currentEnd = now.toISOString().slice(0, 10);
        const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const previousStart = prevMonthDate.toISOString().slice(0, 10);
        const previousEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
            .toISOString()
            .slice(0, 10);

        const [current, previous] = await Promise.all([
            this.dashboard(tenantId, {
                midOrganizationId,
                startDate: currentStart,
                endDate: currentEnd,
            }),
            this.dashboard(tenantId, {
                midOrganizationId,
                startDate: previousStart,
                endDate: previousEnd,
            }),
        ]);

        const delta = (curr: number, prev: number) => {
            if (Math.abs(prev) < 0.000001) return prev === 0 && curr === 0 ? 0 : null;
            return ((curr - prev) / Math.abs(prev)) * 100;
        };

        return {
            current: { period: current.period, totals: current.totals },
            previous: { period: previous.period, totals: previous.totals },
            deltas: {
                totalTokens: delta(current.totals.totalTokens, previous.totals.totalTokens),
                officialCost: delta(current.totals.officialCost, previous.totals.officialCost),
                estimatedGatewayCost: delta(
                    current.totals.estimatedGatewayCost,
                    previous.totals.estimatedGatewayCost,
                ),
                requestCount: delta(current.totals.requestCount, previous.totals.requestCount),
            },
            note: 'MoM compares token and cost metrics separately; seats are reported via licenses summary.',
        };
    }

    async reconciliation(tenantId: string, query: DashboardQueryDto) {
        const { start, end } = this.resolveDateRange(query);
        const qb = this.dailyRepository
            .createQueryBuilder('daily')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.usage_date >= :start', { start })
            .andWhere('daily.usage_date <= :end', { end });
        if (query.midOrganizationId) {
            qb.andWhere('daily.organization_id = :organizationId', {
                organizationId: query.midOrganizationId,
            });
        }
        this.applyConnectionFilter(qb, 'daily', query);
        this.applyProviderUserFilter(qb, 'daily', query);
        if (query.provider) qb.andWhere('daily.provider = :provider', { provider: query.provider });

        const rows = await qb.getMany();
        const keyed = new Map<
            string,
            { date: string; provider: string; model: string; official: number; estimated: number }
        >();

        for (const row of rows) {
            const key = `${row.usageDate}|${row.provider}|${row.model}`;
            const bucket = keyed.get(key) ?? {
                date: row.usageDate,
                provider: row.provider,
                model: row.model,
                official: 0,
                estimated: 0,
            };
            if (row.usageSource === 'provider_admin') bucket.official += Number(row.officialCost);
            if (row.usageSource === 'gateway') bucket.estimated += Number(row.estimatedCost);
            keyed.set(key, bucket);
        }

        const items = Array.from(keyed.values()).map((item) => {
            const gap = item.official - item.estimated;
            const gapPct =
                Math.abs(item.official) < 0.000001
                    ? item.estimated === 0
                        ? 0
                        : null
                    : (gap / Math.abs(item.official)) * 100;
            let status: 'aligned' | 'gateway_higher' | 'admin_higher' | 'missing_side' = 'aligned';
            if (item.official === 0 && item.estimated > 0) status = 'missing_side';
            else if (item.estimated === 0 && item.official > 0) status = 'missing_side';
            else if (gapPct != null && gapPct > 5) status = 'admin_higher';
            else if (gapPct != null && gapPct < -5) status = 'gateway_higher';
            return {
                ...item,
                gap,
                gapPct,
                status,
            };
        });

        return {
            period: { start, end },
            note: 'Admin vs Gateway reconciliation is comparative only — values are never auto-summed.',
            items: items.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)),
        };
    }

    async heatmap(tenantId: string, query: DashboardQueryDto) {
        const { start, end } = this.resolveDateRange(query);
        const qb = this.dailyRepository
            .createQueryBuilder('daily')
            .where('daily.tenant_id = :tenantId', { tenantId })
            .andWhere('daily.usage_date >= :start', { start })
            .andWhere('daily.usage_date <= :end', { end });
        if (query.midOrganizationId) {
            qb.andWhere('daily.organization_id = :organizationId', {
                organizationId: query.midOrganizationId,
            });
        }
        this.applyConnectionFilter(qb, 'daily', query);
        this.applyProviderUserFilter(qb, 'daily', query);

        const rows = await qb.getMany();
        const cells = new Map<
            string,
            { userId: string; model: string; totalTokens: number; officialCost: number; estimatedCost: number }
        >();
        for (const row of rows) {
            const userId = row.providerUserExternalId ?? row.userId ?? 'unknown';
            const key = `${userId}|${row.model}`;
            const cell = cells.get(key) ?? {
                userId,
                model: row.model,
                totalTokens: 0,
                officialCost: 0,
                estimatedCost: 0,
            };
            cell.totalTokens += Number(row.totalTokens);
            cell.officialCost += Number(row.officialCost);
            cell.estimatedCost += Number(row.estimatedCost);
            cells.set(key, cell);
        }

        const rawCells = Array.from(cells.values()).sort((a, b) => b.totalTokens - a.totalTokens);
        const labels = await this.providerUsers.resolveLabels(
            tenantId,
            rawCells.map((cell) => cell.userId),
        );

        return {
            period: { start, end },
            note: 'Heatmap of user × model. Official and estimated remain separate columns.',
            cells: rawCells.map((cell) => ({
                ...cell,
                userLabel: this.providerUsers.labelFor(cell.userId, labels),
            })),
        };
    }
}
