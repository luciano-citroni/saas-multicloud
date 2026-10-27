import type { DashboardPeriod } from '@/components/root/finops/overview/types';

export const ACCOUNT_FILTER_ALL = 'all';
export const PROVIDER_FILTER_ALL = 'all';
export const SERVICE_FILTER_ALL = 'all';

export type FinopsTab = 'spend' | 'optimize';

export type FinopsUrlFilters = {
    period: DashboardPeriod;
    accountId: string | null;
    provider: string | null;
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
    if (period === 'last7days') return 'Últimos 7 dias';
    if (period === 'last30days') return 'Últimos 30 dias';
    if (period === 'last90days') return 'Últimos 90 dias';
    if (period === 'currentmonth') return 'Mês atual';
    if (period === 'lastmonth') return 'Mês passado';
    return 'Ano até hoje';
}

export const DASHBOARD_PERIODS: DashboardPeriod[] = [
    'last7days',
    'last30days',
    'last90days',
    'currentmonth',
    'lastmonth',
    'ytd',
];

export function parseFinopsUrlFilters(searchParams: URLSearchParams): FinopsUrlFilters {
    const periodParam = searchParams.get('period');
    const tabParam = searchParams.get('tab');
    const accountParam = searchParams.get('account');
    const providerParam = searchParams.get('provider');
    const serviceParam = searchParams.get('service');

    const accountId =
        !accountParam || accountParam === ACCOUNT_FILTER_ALL ? null : accountParam;

    const provider =
        !providerParam || providerParam === PROVIDER_FILTER_ALL
            ? null
            : providerParam.toLowerCase();

    const service =
        !serviceParam || serviceParam === SERVICE_FILTER_ALL ? null : serviceParam;

    return {
        period: isDashboardPeriod(periodParam) ? periodParam : 'lastmonth',
        accountId,
        provider,
        service,
        tab: isFinopsTab(tabParam) ? tabParam : 'spend',
    };
}

export function buildFinopsQuery(
    current: URLSearchParams,
    next: Partial<{
        tab: FinopsTab;
        period: DashboardPeriod;
        account: string | null;
        provider: string | null;
        service: string | null;
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
        if (!next.account || next.account === ACCOUNT_FILTER_ALL) params.delete('account');
        else params.set('account', next.account);
    }

    if (next.provider !== undefined) {
        if (!next.provider || next.provider === PROVIDER_FILTER_ALL) params.delete('provider');
        else params.set('provider', next.provider);
    }

    if (next.service !== undefined) {
        if (!next.service || next.service === SERVICE_FILTER_ALL) params.delete('service');
        else params.set('service', next.service);
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
