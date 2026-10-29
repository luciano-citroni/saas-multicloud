import { isTaxService } from '@/components/root/finops/overview/helpers';

export type DashboardOrg = {
    id: string;
    name: string;
    maxCloudAccounts: number;
    maxUsers: number;
    plans: string[];
};

export type DashboardSubscription = {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    planName: string | null;
    maxCloudAccounts: number | null;
    maxOrgAccounts: number | null;
    maxUsers: number | null;
    modules: string[];
};

export type DashboardAccount = {
    id: string;
    alias: string;
    provider: string;
    syncError: boolean;
    isActive: boolean;
};

export type AccountScore = {
    score: number;
    criticalFindings: number;
    highFindings: number;
    totalFindings: number;
    evaluatedAt: string | null;
};

export type GovernanceAccount = DashboardAccount & {
    score: AccountScore | null;
};

export type ServiceSpend = {
    service: string;
    cost: number;
    previousCost: number;
    changePercentage: number;
    currency: string;
};

export type AccountSpend = {
    id: string;
    alias: string;
    provider: string;
    totalCost: number;
    openAnomalies: number;
    openRecs: number;
    hasConsent: boolean;
};

export type FinopsSnapshot = {
    state: 'ready' | 'empty';
    cost: number;
    previousCost: number;
    currency: string;
    momGrowth: number;
    forecastedCost: number | null;
    potentialSavings: number;
    openAnomalies: number;
    hotAnomalies: number;
    anomalyImpact: number;
    openRecommendations: number;
    services: ServiceSpend[];
    accounts: AccountSpend[];
    consentedAccounts: number;
    periodStart: string | null;
    periodEnd: string | null;
};

export type BudgetRisk = {
    accountAlias: string;
    name: string;
    usagePercentage: number;
    currentSpend: number;
    remainingAmount: number;
    amount: number;
    currency: string;
};

export function unwrapItems<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) {
        return payload as T[];
    }

    if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
        return (payload as { items: T[] }).items;
    }

    return [];
}

export function readCount(payload: unknown): number | null {
    if (Array.isArray(payload)) {
        return payload.length;
    }

    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const pagination = (payload as { pagination?: { totalItems?: unknown } }).pagination;
    if (typeof pagination?.totalItems === 'number') {
        return pagination.totalItems;
    }

    const items = (payload as { items?: unknown }).items;
    return Array.isArray(items) ? items.length : null;
}

export function isFinopsProvider(provider: string): boolean {
    const normalized = provider.trim().toLowerCase();
    return normalized === 'aws' || normalized === 'azure' || normalized === 'gcp';
}

export function providerLabel(provider: string): string {
    const normalized = provider.trim().toLowerCase();
    if (normalized === 'aws') return 'AWS';
    if (normalized === 'gcp') return 'GCP';
    if (normalized === 'azure') return 'Azure';
    return provider;
}

export function positiveLimit(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberOrZero(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function parseOrg(payload: unknown, organizationId: string): DashboardOrg | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const organizations = unwrapItems<Record<string, unknown>>((payload as { organizations?: unknown }).organizations);
    const match = organizations.find((organization) => organization.id === organizationId);

    if (!match || typeof match.name !== 'string') {
        return null;
    }

    return {
        id: organizationId,
        name: match.name,
        maxCloudAccounts: numberOrZero(match.maxCloudAccounts),
        maxUsers: numberOrZero(match.maxUsers),
        plans: Array.isArray(match.plans) ? match.plans.filter((item): item is string => typeof item === 'string') : [],
    };
}

export function parseSubscription(payload: unknown): DashboardSubscription | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const row = payload as Record<string, unknown>;
    if (typeof row.status !== 'string') {
        return null;
    }

    const plan = row.plan && typeof row.plan === 'object' ? (row.plan as Record<string, unknown>) : null;
    const metadata = plan?.metadata && typeof plan.metadata === 'object' ? (plan.metadata as Record<string, unknown>) : null;

    return {
        status: row.status,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd === true,
        currentPeriodEnd: typeof row.currentPeriodEnd === 'string' ? row.currentPeriodEnd : null,
        planName: plan && typeof plan.name === 'string' ? plan.name : null,
        maxCloudAccounts: positiveLimit(metadata?.maxCloudAccounts),
        maxOrgAccounts: positiveLimit(metadata?.maxOrgAccounts),
        maxUsers: positiveLimit(metadata?.maxUsers),
        modules: Array.isArray(metadata?.modules) ? metadata.modules.filter((item): item is string => typeof item === 'string') : [],
    };
}

export function parseAccounts(payload: unknown): { accounts: DashboardAccount[]; total: number } {
    const accounts = unwrapItems<Record<string, unknown>>(payload).flatMap((item) => {
        if (typeof item.id !== 'string' || typeof item.alias !== 'string' || typeof item.provider !== 'string') {
            return [];
        }

        return [
            {
                id: item.id,
                alias: item.alias,
                provider: item.provider,
                syncError: typeof item.lastGeneralSyncError === 'string' && item.lastGeneralSyncError.trim().length > 0,
                isActive: item.isActive !== false,
            },
        ];
    });

    return {
        accounts,
        total: readCount(payload) ?? accounts.length,
    };
}

export function parseScore(payload: unknown): AccountScore | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const row = payload as Record<string, unknown>;
    const score = Number(row.score);
    if (!Number.isFinite(score)) {
        return null;
    }

    return {
        score,
        criticalFindings: numberOrZero(row.criticalFindings),
        highFindings: numberOrZero(row.highFindings),
        totalFindings: numberOrZero(row.totalFindings),
        evaluatedAt: typeof row.evaluatedAt === 'string' ? row.evaluatedAt : null,
    };
}

export function parseOverview(payload: unknown): FinopsSnapshot | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const totals = (payload as { totals?: unknown }).totals;
    if (!totals || typeof totals !== 'object') {
        return null;
    }

    const row = totals as Record<string, unknown>;
    const cost = Number(row.cost);
    if (!Number.isFinite(cost)) {
        return null;
    }

    const period = (payload as { period?: unknown }).period;
    const periodRow = period && typeof period === 'object' ? (period as Record<string, unknown>) : null;

    const anomalies = unwrapItems<Record<string, unknown>>((payload as { anomalies?: unknown }).anomalies);
    const recommendations = unwrapItems<Record<string, unknown>>((payload as { recommendations?: unknown }).recommendations);
    const services = unwrapItems<Record<string, unknown>>((payload as { costByService?: unknown }).costByService)
        .flatMap((item) => {
            if (typeof item.service !== 'string' || isTaxService(item.service)) {
                return [];
            }

            const serviceCost = Number(item.currentMonthCost);
            if (!Number.isFinite(serviceCost)) {
                return [];
            }

            return [
                {
                    service: item.service,
                    cost: serviceCost,
                    previousCost: numberOrZero(item.previousMonthCost),
                    changePercentage: numberOrZero(item.changePercentage),
                    currency: typeof item.currency === 'string' ? item.currency : 'USD',
                },
            ];
        })
        .sort((left, right) => right.cost - left.cost)
        .slice(0, 5);

    const accounts = unwrapItems<Record<string, unknown>>((payload as { accounts?: unknown }).accounts)
        .flatMap((item) => {
            if (typeof item.id !== 'string' || typeof item.alias !== 'string' || typeof item.provider !== 'string') {
                return [];
            }

            return [
                {
                    id: item.id,
                    alias: item.alias,
                    provider: item.provider,
                    totalCost: numberOrZero(item.totalCost),
                    openAnomalies: numberOrZero(item.openAnomalies),
                    openRecs: numberOrZero(item.openRecs),
                    hasConsent: item.hasConsent === true,
                },
            ];
        })
        .sort((left, right) => right.totalCost - left.totalCost);

    const previousFromServices = services.reduce((sum, service) => sum + service.previousCost, 0);
    const momGrowth = numberOrZero(row.momGrowth);
    const previousFromGrowth = momGrowth === -100 ? 0 : momGrowth === 0 ? cost : cost / (1 + momGrowth / 100);
    const previousCost = previousFromServices > 0 ? previousFromServices : Number.isFinite(previousFromGrowth) ? Math.max(0, previousFromGrowth) : 0;

    const consentedAccounts = accounts.filter((account) => account.hasConsent).length;
    const potentialSavings = numberOrZero(row.potentialSavings);
    const forecastValue = row.forecastedCost == null ? null : Number(row.forecastedCost);
    const anomalyImpact = anomalies.reduce((sum, item) => sum + numberOrZero(item.financialImpact), 0);
    const hasSignal = cost > 0 || services.length > 0 || anomalies.length > 0 || potentialSavings > 0 || accounts.some((a) => a.totalCost > 0);

    return {
        state: hasSignal ? 'ready' : 'empty',
        cost,
        previousCost,
        currency: typeof row.currency === 'string' ? row.currency : 'USD',
        momGrowth,
        forecastedCost: forecastValue != null && Number.isFinite(forecastValue) && forecastValue > 0 ? forecastValue : null,
        potentialSavings,
        openAnomalies: anomalies.length,
        hotAnomalies: anomalies.filter((item) => item.severity === 'critical' || item.severity === 'high').length,
        anomalyImpact,
        openRecommendations: recommendations.length,
        services,
        accounts: accounts.slice(0, 5),
        consentedAccounts,
        periodStart: typeof periodRow?.startDate === 'string' ? periodRow.startDate : null,
        periodEnd: typeof periodRow?.endDate === 'string' ? periodRow.endDate : null,
    };
}

export function parseBudgets(payload: unknown, accountAlias?: string): BudgetRisk[] {
    return unwrapItems<Record<string, unknown>>(payload).flatMap((item) => {
        const budget = item.budget;
        if (!budget || typeof budget !== 'object') {
            return [];
        }

        const name = (budget as { name?: unknown }).name;
        const amount = Number((budget as { amount?: unknown }).amount);
        const usagePercentage = Number(item.usagePercentage);
        if (typeof name !== 'string' || !Number.isFinite(usagePercentage)) {
            return [];
        }

        const resolvedAlias =
            (typeof item.cloudAccountAlias === 'string' && item.cloudAccountAlias) ||
            accountAlias ||
            '—';

        return [
            {
                accountAlias: resolvedAlias,
                name,
                usagePercentage,
                currentSpend: numberOrZero(item.currentSpend),
                remainingAmount: numberOrZero(item.remainingAmount),
                amount: Number.isFinite(amount) ? amount : 0,
                currency: typeof item.currency === 'string' ? item.currency : 'USD',
            },
        ];
    });
}
