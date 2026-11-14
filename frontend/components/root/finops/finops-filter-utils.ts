import type { DashboardPeriod } from '@/components/root/finops/overview/types';
import { getLocale } from '@/lib/locale';
import { translations } from '@/lib/i18n/translations';

export const ACCOUNT_FILTER_ALL = 'all';
export const PROVIDER_FILTER_ALL = 'all';
export const SERVICE_FILTER_ALL = 'all';

export type FinopsTab = 'spend' | 'optimize';

export type FinopsUrlFilters = {
    period: DashboardPeriod;
    /** Uma ou mais contas selecionadas (vazio = todas). */
    accountIds: string[];
    /** @deprecated use accountIds — mantido para compat com páginas que ainda leem singular. */
    accountId: string | null;
    providers: string[];
    /** @deprecated use providers */
    provider: string | null;
    services: string[];
    /** @deprecated use services */
    service: string | null;
    tab: FinopsTab;
};

export function isDashboardPeriod(value: string | null): value is DashboardPeriod {
    return (
        value === 'last7days' ||
        value === 'last30days' ||
        value === 'last90days' ||
        value === 'currentmonth' ||
        value === 'lastmonth' ||
        value === 'ytd'
    );
}

export function isFinopsTab(value: string | null): value is FinopsTab {
    return value === 'spend' || value === 'optimize';
}

export function periodLabel(period: DashboardPeriod): string {
    const t = translations[getLocale()].finops;
    if (period === 'last7days') return t.periodLast7days;
    if (period === 'last30days') return t.periodLast30days;
    if (period === 'last90days') return t.periodLast90days;
    if (period === 'currentmonth') return t.periodCurrentMonth;
    if (period === 'lastmonth') return t.periodLastMonth;
    return t.periodYtd;
}

export const DASHBOARD_PERIODS: DashboardPeriod[] = [
    'last7days',
    'last30days',
    'last90days',
    'currentmonth',
    'lastmonth',
    'ytd',
];

/** Parse lista CSV da URL; ignora sentinelas "all" / "organization". */
export function parseCsvParam(value: string | null, ignore: string[] = [ACCOUNT_FILTER_ALL]): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !ignore.includes(part));
}

export function serializeCsvParam(values: string[]): string | null {
    const cleaned = values.map((v) => v.trim()).filter(Boolean);
    if (cleaned.length === 0) return null;
    return cleaned.join(',');
}

export function parseFinopsUrlFilters(searchParams: URLSearchParams): FinopsUrlFilters {
    const periodParam = searchParams.get('period');
    const tabParam = searchParams.get('tab');
    const accountParam = searchParams.get('account');
    const providerParam = searchParams.get('provider');
    const serviceParam = searchParams.get('service');

    // "organization" is the budgets-only org-scope sentinel — never a cloud account UUID.
    const accountIds = parseCsvParam(accountParam, [ACCOUNT_FILTER_ALL, 'organization']);

    const providers = parseCsvParam(providerParam, [PROVIDER_FILTER_ALL]).map((p) => p.toLowerCase());

    const services = parseCsvParam(serviceParam, [SERVICE_FILTER_ALL]);

    return {
        period: isDashboardPeriod(periodParam) ? periodParam : 'lastmonth',
        accountIds,
        accountId: accountIds[0] ?? null,
        providers,
        provider: providers[0] ?? null,
        services,
        service: services[0] ?? null,
        tab: isFinopsTab(tabParam) ? tabParam : 'spend',
    };
}

export function buildFinopsQuery(
    current: URLSearchParams,
    next: Partial<{
        tab: FinopsTab;
        period: DashboardPeriod;
        account: string | string[] | null;
        provider: string | string[] | null;
        service: string | string[] | null;
    }>
): string {
    const params = new URLSearchParams(current.toString());
    params.delete('scope');

    if (next.tab !== undefined) {
        if (next.tab === 'spend') params.delete('tab');
        else params.set('tab', next.tab);
    }

    if (next.period !== undefined) {
        if (next.period === 'lastmonth') params.delete('period');
        else params.set('period', next.period);
    }

    if (next.account !== undefined) {
        const list = Array.isArray(next.account)
            ? next.account
            : next.account && next.account !== ACCOUNT_FILTER_ALL
              ? [next.account]
              : [];
        const serialized = serializeCsvParam(list);
        if (!serialized) params.delete('account');
        else params.set('account', serialized);
    }

    if (next.provider !== undefined) {
        const list = Array.isArray(next.provider)
            ? next.provider
            : next.provider && next.provider !== PROVIDER_FILTER_ALL
              ? [next.provider]
              : [];
        const serialized = serializeCsvParam(list.map((p) => p.toLowerCase()));
        if (!serialized) params.delete('provider');
        else params.set('provider', serialized);
    }

    if (next.service !== undefined) {
        const list = Array.isArray(next.service)
            ? next.service
            : next.service && next.service !== SERVICE_FILTER_ALL
              ? [next.service]
              : [];
        const serialized = serializeCsvParam(list);
        if (!serialized) params.delete('service');
        else params.set('service', serialized);
    }

    return params.toString();
}

export function downloadCsv(filename: string, rows: string[][]) {
    const escape = (cell: string) => {
        const value = cell.replace(/"/g, '""');
        return /[",\n\r]/.test(value) ? `"${value}"` : value;
    };

    const csvBody = rows.map((row) => row.map((cell) => escape(String(cell ?? ''))).join(',')).join('\r\n');
    // BOM para Excel abrir UTF-8 corretamente
    const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
