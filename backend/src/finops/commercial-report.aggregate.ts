export type CostGrain = 'daily' | 'monthly';

export type ServiceCostRow = {
    accountId: string;
    provider: string;
    service: string;
    day: string;
    month: string;
    currency: string;
    granularity: CostGrain;
    cost: number;
};

export type ResourceCostRow = {
    name: string;
    service: string;
    month: string;
    currency: string;
    granularity: CostGrain;
    cost: number;
    /** usage = mês fechado (usage type AWS); resource = id do recurso. */
    source?: 'usage' | 'resource';
};

export type AccountRef = {
    id: string;
    alias: string;
    provider: string;
};

export type CommercialReportMonth = {
    key: string;
    days: number;
};

export type CommercialReportModel = {
    referenceMonth: string;
    months: CommercialReportMonth[];
    sourceCurrency: string;
    displayCurrency: string;
    exchangeRate: number | null;
    previousExchangeRate: number | null;
    exchangeRateChangePct: number | null;
    providers: string[];
    kpis: {
        totalCost: number;
        totalChangePct: number | null;
        avgDailyCost: number;
        avgDailyChangePct: number | null;
        previousAvgDaily: number;
        daysInMonth: number;
        accountsWithSpend: number;
        accountsTotal: number;
        projection: number | null;
        projectionBaseDays: number;
        projectionMonth: string;
        projectionSource: 'provider' | 'mixed' | 'linear';
        otherCurrencyTotal: number | null;
    };
    totalEvolution: Array<{ month: string; cost: number; changePct: number | null }>;
    avgDailyEvolution: Array<{ month: string; avg: number; changePct: number | null }>;
    accountEvolution: Array<{ accountId: string; alias: string; costs: number[] }>;
    subscriptionTable: Array<{
        accountId: string;
        alias: string;
        costs: number[];
        change12: number | null;
        change23: number | null;
    }>;
    dailyPrevious: Array<{ date: string; cost: number }>;
    dailyReference: Array<{ date: string; cost: number }>;
    inProgress: {
        month: string;
        points: Array<{ date: string; cost: number }>;
        omittedDays: number;
        projection: number | null;
        baseDays: number;
    };
    reductions: Array<{ name: string; amount: number }>;
    reductionSum: number;
    increases: Array<{ name: string; amount: number }>;
    increaseSum: number;
    topServices: Array<{ service: string; cost: number }>;
    topResources: Array<{ name: string; cost: number }>;
    costByAccount: Array<{ accountId: string; alias: string; cost: number }>;
    accountByService: {
        services: string[];
        rows: Array<{ accountId: string; alias: string; costs: number[] }>;
    };
};

export function shiftMonth(key: string, delta: number): string {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(key: string): { key: string; start: string; end: string; days: number } {
    const [year, month] = key.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, '0');
    const normalized = `${year}-${mm}`;
    return {
        key: normalized,
        start: `${normalized}-01`,
        end: `${normalized}-${String(days).padStart(2, '0')}`,
        days,
    };
}

export function saoPauloToday(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

export function addUtcDays(iso: string, days: number): string {
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
}

export function previousClosedMonth(todayIso: string): string {
    return shiftMonth(todayIso.slice(0, 7), -1);
}

/** Envio automático do relatório comercial: uma vez por mês, no dia 7. */
export function isCommercialAutoSendDay(todayIso: string): boolean {
    return todayIso.slice(8, 10) === '07';
}

export function isClosedMonth(month: string, todayIso: string): boolean {
    return month < todayIso.slice(0, 7);
}

function isTaxService(service: string): boolean {
    const normalized = service.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'tax' || normalized === 'taxes' || normalized === 'vat') return true;
    return /\btax(es)?\b/.test(normalized) || normalized.includes('imposto');
}

function changePct(current: number, previous: number): number | null {
    if (Math.abs(previous) < 0.000001) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

function preferRows<T extends { month: string; granularity: CostGrain; cost: number }>(rows: T[], month: string): T[] {
    const daily = rows.filter((row) => row.month === month && row.granularity === 'daily');
    if (daily.some((row) => Math.abs(row.cost) > 0)) return daily;
    return rows.filter((row) => row.month === month && row.granularity === 'monthly');
}

function closedResourceRows(rows: ResourceCostRow[], month: string): ResourceCostRow[] {
    const monthRows = rows.filter((row) => row.month === month);
    const usage = monthRows.filter((row) => row.source === 'usage');
    if (usage.some((row) => Math.abs(row.cost) > 0)) return usage;
    return monthRows.filter((row) => row.source !== 'usage');
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function fillDaily(
    month: { start: string; end: string },
    costs: Map<string, number>,
    lastDate?: string,
): Array<{ date: string; cost: number }> {
    const points: Array<{ date: string; cost: number }> = [];
    const end = lastDate && lastDate < month.end ? lastDate : month.end;
    if (end < month.start) return points;
    for (let cursor = month.start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
        points.push({ date: cursor, cost: costs.get(cursor) ?? 0 });
    }
    return points;
}

function dominantCurrency(rows: Array<{ currency: string; cost: number }>): string {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const code = (row.currency || 'USD').toUpperCase();
        totals.set(code, (totals.get(code) ?? 0) + Math.abs(row.cost));
    }
    let winner = 'USD';
    let best = -1;
    for (const [code, total] of totals) {
        if (total > best) {
            winner = code;
            best = total;
        }
    }
    return winner;
}

export type AccountForecastInput = {
    accountId: string;
    amount: number;
    currency: string;
};

export function buildCommercialReport(input: {
    referenceMonth: string;
    todayIso: string;
    accounts: AccountRef[];
    serviceRows: ServiceCostRow[];
    resourceRows: ResourceCostRow[];
    exchangeRate: number | null;
    previousExchangeRate: number | null;
    exchangeRateChangePct?: number | null;
    /** Forecast nativo por conta, na moeda do provedor. Ausente mantém a projeção linear. */
    accountForecasts?: AccountForecastInput[];
}): CommercialReportModel {
    const reference = monthBounds(input.referenceMonth);
    const previous = monthBounds(shiftMonth(reference.key, -1));
    const oldest = monthBounds(shiftMonth(reference.key, -2));
    const months = [oldest, previous, reference];
    const current = monthBounds(input.todayIso.slice(0, 7));

    const serviceByMonth = new Map(months.map((month) => [month.key, preferRows(input.serviceRows, month.key)]));
    const currentService = preferRows(input.serviceRows, current.key).filter((row) => row.granularity === 'daily');
    const referenceRows = serviceByMonth.get(reference.key) ?? [];
    const sourceCurrency = dominantCurrency(referenceRows.length > 0 ? referenceRows : input.serviceRows);
    const rate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : null;
    const displayCurrency = sourceCurrency === 'USD' && rate ? 'BRL' : sourceCurrency;
    const factor = sourceCurrency === 'USD' && displayCurrency === 'BRL' && rate ? rate : 1;

    const money = (amount: number) => amount * factor;

    const accountMeta = new Map(input.accounts.map((account) => [account.id, account]));

    const monthAccountCost = (monthKey: string) => {
        const totals = new Map<string, number>();
        for (const row of serviceByMonth.get(monthKey) ?? []) {
            if (row.currency.toUpperCase() !== sourceCurrency) continue;
            totals.set(row.accountId, (totals.get(row.accountId) ?? 0) + money(row.cost));
        }
        return totals;
    };

    const costs = months.map((month) => monthAccountCost(month.key));
    const monthTotals = costs.map((byAccount) => sum([...byAccount.values()]));

    const dailyOf = (rows: ServiceCostRow[], month: { start: string; end: string }, lastDate?: string) => {
        const byDay = new Map<string, number>();
        for (const row of rows) {
            if (row.granularity !== 'daily') continue;
            if (row.currency.toUpperCase() !== sourceCurrency) continue;
            if (row.day < month.start || row.day > (lastDate && lastDate < month.end ? lastDate : month.end)) continue;
            byDay.set(row.day, (byDay.get(row.day) ?? 0) + money(row.cost));
        }
        return fillDaily(month, byDay, lastDate);
    };

    const cutoff = addUtcDays(input.todayIso, -2);
    const inProgressEnd = cutoff < current.start ? current.start : cutoff > current.end ? current.end : cutoff;
    const baseDays = cutoff < current.start ? 0 : Number(inProgressEnd.slice(8, 10));
    const inProgressPoints = baseDays > 0 ? dailyOf(currentService, current, inProgressEnd) : [];
    const inProgressSum = sum(inProgressPoints.map((point) => point.cost));
    let projection = baseDays > 0 ? (inProgressSum / baseDays) * current.days : null;
    let projectionSource: CommercialReportModel['kpis']['projectionSource'] = 'linear';

    if (input.accountForecasts) {
        const accepted = new Map<string, number>();
        for (const forecast of input.accountForecasts) {
            if (!Number.isFinite(forecast.amount)) continue;
            if (forecast.currency.toUpperCase() !== sourceCurrency) continue;
            accepted.set(forecast.accountId, forecast.amount);
        }

        const linearForAccount = (accountId: string): number | null => {
            if (baseDays <= 0) return null;
            const rows = currentService.filter((row) => row.accountId === accountId);
            const accountSum = sum(dailyOf(rows, current, inProgressEnd).map((point) => point.cost));
            if (Math.abs(accountSum) < 0.000001) return null;
            return (accountSum / baseDays) * current.days;
        };

        const accountIds = new Set<string>([
            ...accepted.keys(),
            ...currentService.filter((row) => row.currency.toUpperCase() === sourceCurrency).map((row) => row.accountId),
        ]);
        let providerCount = 0;
        let linearCount = 0;
        let total = 0;
        for (const accountId of accountIds) {
            const provided = accepted.get(accountId);
            if (provided != null) {
                total += money(provided);
                providerCount += 1;
                continue;
            }
            const linear = linearForAccount(accountId);
            if (linear == null) continue;
            total += linear;
            linearCount += 1;
        }
        if (providerCount + linearCount > 0) {
            projection = total;
            projectionSource = providerCount > 0 && linearCount === 0 ? 'provider' : providerCount > 0 ? 'mixed' : 'linear';
        }
    }

    const accountIds = new Set<string>(input.accounts.map((account) => account.id));
    for (const byAccount of costs) {
        for (const accountId of byAccount.keys()) accountIds.add(accountId);
    }

    const aliasOf = (accountId: string) => accountMeta.get(accountId)?.alias || accountId;
    const providerOf = (accountId: string) => accountMeta.get(accountId)?.provider || '';

    const table = [...accountIds]
        .map((accountId) => {
            const values = costs.map((byAccount) => byAccount.get(accountId) ?? 0);
            return {
                accountId,
                alias: aliasOf(accountId),
                costs: values,
                change12: changePct(values[1], values[0]),
                change23: changePct(values[2], values[1]),
            };
        })
        .filter((row) => row.costs.some((value) => Math.abs(value) > 0.000001) || accountMeta.has(row.accountId))
        .sort((left, right) => right.costs[2] - left.costs[2] || left.alias.localeCompare(right.alias));

    const accountsWithSpend = table.filter((row) => row.costs[2] > 0.000001 && accountMeta.has(row.accountId)).length;
    const providers = [
        ...new Set(
            table
                .filter((row) => row.costs[2] > 0.000001)
                .map((row) => providerOf(row.accountId).toUpperCase())
                .filter(Boolean),
        ),
    ];

    const resourceFor = (monthKey: string) => {
        const rows = closedResourceRows(input.resourceRows, monthKey).filter(
            (row) => row.currency.toUpperCase() === sourceCurrency && !isTaxService(row.service) && row.name.trim(),
        );
        const totals = new Map<string, number>();
        for (const row of rows) totals.set(row.name, (totals.get(row.name) ?? 0) + money(row.cost));
        return totals;
    };

    const previousResources = resourceFor(previous.key);
    const referenceResources = resourceFor(reference.key);
    const resourceNames = new Set([...previousResources.keys(), ...referenceResources.keys()]);
    const deltas = [...resourceNames].map((name) => ({
        name,
        delta: (referenceResources.get(name) ?? 0) - (previousResources.get(name) ?? 0),
    }));
    const reductions = deltas
        .filter((item) => item.delta < -0.000001)
        .sort((left, right) => left.delta - right.delta)
        .slice(0, 10)
        .map((item) => ({ name: item.name, amount: Math.abs(item.delta) }));
    const increases = deltas
        .filter((item) => item.delta > 0.000001)
        .sort((left, right) => right.delta - left.delta)
        .slice(0, 10)
        .map((item) => ({ name: item.name, amount: item.delta }));

    const serviceTotals = new Map<string, number>();
    const serviceByAccount = new Map<string, Map<string, number>>();
    for (const row of referenceRows) {
        if (row.currency.toUpperCase() !== sourceCurrency || isTaxService(row.service)) continue;
        const service = row.service.trim() || 'Unknown';
        const value = money(row.cost);
        serviceTotals.set(service, (serviceTotals.get(service) ?? 0) + value);
        const byService = serviceByAccount.get(row.accountId) ?? new Map<string, number>();
        byService.set(service, (byService.get(service) ?? 0) + value);
        serviceByAccount.set(row.accountId, byService);
    }
    const topServices = [...serviceTotals.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([service, cost]) => ({ service, cost }));
    const topServiceNames = topServices.slice(0, 8).map((item) => item.service);

    const totalCost = monthTotals[2];
    const otherCurrencyTotal =
        displayCurrency === 'BRL' && rate ? totalCost / rate : displayCurrency === 'USD' && rate ? totalCost * rate : null;

    return {
        referenceMonth: reference.key,
        months: months.map((month) => ({ key: month.key, days: month.days })),
        sourceCurrency,
        displayCurrency,
        exchangeRate: rate,
        previousExchangeRate: input.previousExchangeRate && input.previousExchangeRate > 0 ? input.previousExchangeRate : null,
        exchangeRateChangePct:
            input.exchangeRateChangePct != null && Number.isFinite(input.exchangeRateChangePct)
                ? input.exchangeRateChangePct
                : rate && input.previousExchangeRate && input.previousExchangeRate > 0
                  ? changePct(rate, input.previousExchangeRate)
                  : null,
        providers,
        kpis: {
            totalCost,
            totalChangePct: changePct(monthTotals[2], monthTotals[1]),
            avgDailyCost: reference.days > 0 ? totalCost / reference.days : 0,
            avgDailyChangePct: changePct(
                reference.days > 0 ? totalCost / reference.days : 0,
                previous.days > 0 ? monthTotals[1] / previous.days : 0,
            ),
            previousAvgDaily: previous.days > 0 ? monthTotals[1] / previous.days : 0,
            daysInMonth: reference.days,
            accountsWithSpend,
            accountsTotal: input.accounts.length,
            projection,
            projectionBaseDays: baseDays,
            projectionMonth: current.key,
            projectionSource,
            otherCurrencyTotal,
        },
        totalEvolution: months.map((month, index) => ({
            month: month.key,
            cost: monthTotals[index],
            changePct: index === 0 ? null : changePct(monthTotals[index], monthTotals[index - 1]),
        })),
        avgDailyEvolution: months.map((month, index) => ({
            month: month.key,
            avg: month.days > 0 ? monthTotals[index] / month.days : 0,
            changePct:
                index === 0
                    ? null
                    : changePct(
                          month.days > 0 ? monthTotals[index] / month.days : 0,
                          months[index - 1].days > 0 ? monthTotals[index - 1] / months[index - 1].days : 0,
                      ),
        })),
        accountEvolution: table
            .filter((row) => row.costs.some((value) => value > 0.000001))
            .map((row) => ({ accountId: row.accountId, alias: row.alias, costs: row.costs })),
        subscriptionTable: table,
        dailyPrevious: dailyOf(serviceByMonth.get(previous.key) ?? [], previous),
        dailyReference: dailyOf(referenceRows, reference),
        inProgress: {
            month: current.key,
            points: inProgressPoints,
            omittedDays: 2,
            projection,
            baseDays,
        },
        reductions,
        reductionSum: sum(reductions.map((item) => item.amount)),
        increases,
        increaseSum: sum(increases.map((item) => item.amount)),
        topServices,
        topResources: [...referenceResources.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10)
            .map(([name, cost]) => ({ name, cost })),
        costByAccount: table
            .filter((row) => row.costs[2] > 0.000001)
            .map((row) => ({ accountId: row.accountId, alias: row.alias, cost: row.costs[2] })),
        accountByService: {
            services: topServiceNames,
            rows: table
                .map((row) => ({
                    accountId: row.accountId,
                    alias: row.alias,
                    costs: topServiceNames.map((service) => serviceByAccount.get(row.accountId)?.get(service) ?? 0),
                }))
                .filter((row) => row.costs.some((value) => value > 0.000001)),
        },
    };
}
