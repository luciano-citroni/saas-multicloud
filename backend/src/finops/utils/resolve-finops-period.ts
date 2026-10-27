export type FinopsPeriodKey = 'last7days' | 'last30days' | 'last90days' | 'currentmonth' | 'lastmonth' | 'ytd';

export type ResolvedFinopsPeriod = {
    period: FinopsPeriodKey | 'custom';
    year: number;
    month: number;
    anomalyDays: number;
    startDate: string;
    endDate: string;
};

const PERIOD_KEYS: FinopsPeriodKey[] = [
    'last7days',
    'last30days',
    'last90days',
    'currentmonth',
    'lastmonth',
    'ytd',
];

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function formatDateOnly(date: Date): string {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

export function isFinopsPeriodKey(value: string | undefined | null): value is FinopsPeriodKey {
    return typeof value === 'string' && PERIOD_KEYS.includes(value as FinopsPeriodKey);
}

/**
 * Normaliza filtros de período FinOps a partir de `period` OU `year`+`month`.
 * Preferência: `period` quando válido; senão year/month; senão lastmonth.
 */
export function resolveFinopsPeriod(input: {
    period?: string;
    year?: number | string;
    month?: number | string;
    now?: Date;
}): ResolvedFinopsPeriod {
    const now = input.now ?? new Date();
    const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    if (isFinopsPeriodKey(input.period)) {
        return resolveFromPeriodKey(input.period, utcNow);
    }

    const year = typeof input.year === 'string' ? parseInt(input.year, 10) : input.year;
    const month = typeof input.month === 'string' ? parseInt(input.month, 10) : input.month;

    if (year && month && month >= 1 && month <= 12 && Number.isFinite(year)) {
        const start = new Date(Date.UTC(year, month - 1, 1));
        const endExclusive = new Date(Date.UTC(year, month, 1));
        const end = addDays(endExclusive, -1);
        const daysInMonth = end.getUTCDate();

        return {
            period: 'custom',
            year,
            month,
            anomalyDays: daysInMonth,
            startDate: formatDateOnly(start),
            endDate: formatDateOnly(end),
        };
    }

    return resolveFromPeriodKey('lastmonth', utcNow);
}

function resolveFromPeriodKey(period: FinopsPeriodKey, utcNow: Date): ResolvedFinopsPeriod {
    const currentYear = utcNow.getUTCFullYear();
    const currentMonth = utcNow.getUTCMonth() + 1;
    const todayStr = formatDateOnly(utcNow);

    if (period === 'last7days') {
        const start = addDays(utcNow, -6);
        return {
            period,
            year: currentYear,
            month: currentMonth,
            anomalyDays: 7,
            startDate: formatDateOnly(start),
            endDate: todayStr,
        };
    }

    if (period === 'last30days') {
        const start = addDays(utcNow, -29);
        return {
            period,
            year: currentYear,
            month: currentMonth,
            anomalyDays: 30,
            startDate: formatDateOnly(start),
            endDate: todayStr,
        };
    }

    if (period === 'last90days') {
        const start = addDays(utcNow, -89);
        return {
            period,
            year: currentYear,
            month: currentMonth,
            anomalyDays: 90,
            startDate: formatDateOnly(start),
            endDate: todayStr,
        };
    }

    if (period === 'currentmonth') {
        const start = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
        return {
            period,
            year: currentYear,
            month: currentMonth,
            anomalyDays: Math.max(1, utcNow.getUTCDate()),
            startDate: formatDateOnly(start),
            endDate: todayStr,
        };
    }

    if (period === 'ytd') {
        const start = new Date(Date.UTC(currentYear, 0, 1));
        const startOfYear = Date.UTC(currentYear, 0, 1);
        const anomalyDays = Math.max(1, Math.floor((utcNow.getTime() - startOfYear) / 86_400_000) + 1);
        return {
            period,
            year: currentYear,
            month: currentMonth,
            anomalyDays,
            startDate: formatDateOnly(start),
            endDate: todayStr,
        };
    }

    // lastmonth
    const ref = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
    const year = ref.getUTCFullYear();
    const month = ref.getUTCMonth() + 1;
    const end = new Date(Date.UTC(year, month, 0));

    return {
        period: 'lastmonth',
        year,
        month,
        anomalyDays: end.getUTCDate(),
        startDate: formatDateOnly(ref),
        endDate: formatDateOnly(end),
    };
}
