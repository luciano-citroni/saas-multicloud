import { getLocale } from '@/lib/locale';
import { toIntlLocale } from '@/lib/i18n/format';

export type FinopsBudgetStatusItem = {
    budget: {
        id: string;
        name: string;
        amount: number;
        currency: string;
        period: string;
        scope?: 'organization' | 'cloud_account';
        cloudAccountId?: string | null;
        service: string | null;
        resourceId?: string | null;
        alertThresholds: number[];
        alertFrequency?: string;
        alertType?: string;
        alertAmount?: number | null;
        alertChannels?: Array<'email' | 'whatsapp'>;
        alertEmails?: string[];
        alertNotificationGroupIds?: string[];
        isActive: boolean;
    };
    currentSpend: number;
    remainingAmount: number;
    usagePercentage: number;
    triggeredAlerts: number[];
    currency: string;
    cloudAccountAlias?: string;
};

/** Limite usado no status (alertAmount para tipo amount; senão amount do orçamento). */
export function getBudgetEffectiveLimit(budget: FinopsBudgetStatusItem['budget']): number {
    if (budget.alertType === 'amount' && budget.alertAmount != null) {
        return Number(budget.alertAmount);
    }
    return Number(budget.amount);
}

export function isBudgetAtRisk(item: FinopsBudgetStatusItem): boolean {
    return (item.triggeredAlerts?.length ?? 0) > 0 || item.usagePercentage >= 80;
}

/** Orçamento com maior uso percentual (pior risco). */
export function pickHighestRiskBudget(
    statuses: FinopsBudgetStatusItem[],
): FinopsBudgetStatusItem | null {
    if (statuses.length === 0) return null;
    return [...statuses].sort((a, b) => b.usagePercentage - a.usagePercentage)[0] ?? null;
}

export function countBudgetsAtRisk(statuses: FinopsBudgetStatusItem[]): number {
    return statuses.filter(isBudgetAtRisk).length;
}

export type BudgetRiskState = 'empty' | 'healthy' | 'near' | 'exceeded';

export function getBudgetRiskState(item: FinopsBudgetStatusItem | null): BudgetRiskState {
    if (!item) return 'empty';
    if (item.usagePercentage >= 100 || item.triggeredAlerts?.some((t) => t >= 100)) return 'exceeded';
    if (isBudgetAtRisk(item)) return 'near';
    return 'healthy';
}

/** Rótulo do período de acumulação do gasto (mês/dia atual em UTC). */
export function formatBudgetSpendPeriodLabel(period: string): string {
    const now = new Date();
    const locale = getLocale();
    if (period === 'daily') {
        const day = now.toLocaleDateString(toIntlLocale(), { day: '2-digit', month: 'short', timeZone: 'UTC' });
        return locale === 'en' ? `Today's spend (${day})` : `Gasto de hoje (${day})`;
    }
    const monthLabel = now.toLocaleDateString(toIntlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return locale === 'en' ? `Current month spend (${monthLabel})` : `Gasto do mês atual (${monthLabel})`;
}

export function hasNoSpendInBudgetPeriod(item: FinopsBudgetStatusItem): boolean {
    return Number(item.currentSpend) <= 0 && item.usagePercentage <= 0;
}
