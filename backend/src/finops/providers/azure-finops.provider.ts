import { Injectable, Logger } from '@nestjs/common';

import { ClientSecretCredential } from '@azure/identity';

import type {
    IFinopsProvider,
    FinopsCommitmentRecommendationEntry,
    FinopsCommitmentUtilizationEntry,
    FinopsCostCollectionResult,
    FinopsCreditConsumptionEntry,
    FinopsProviderCredentials,
    ProviderCostForecast,
} from './finops-provider.interface';
import { capResourceEntriesByDay } from './finops-provider.interface';
import { readForecastCache, writeForecastCache } from './forecast-cache';

interface AzureCostQueryColumn {
    name: string;
    type: string;
}

interface AzureCostQueryRow {
    [index: number]: string | number;
}

interface AzureCostQueryResult {
    nextLink?: string;
    properties?: {
        columns?: AzureCostQueryColumn[];
        rows?: AzureCostQueryRow[];
        nextLink?: string;
    };
}

@Injectable()
export class AzureFinopsProvider implements IFinopsProvider {
    readonly provider = 'azure';

    private readonly logger = new Logger(AzureFinopsProvider.name);

    async collectCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY',
    ): Promise<FinopsCostCollectionResult> {
        const { credentials, cloudAccountId } = creds;
        const { tenantId, clientId, clientSecret, subscriptionId } = credentials as {
            tenantId: string;
            clientId: string;
            clientSecret: string;
            subscriptionId: string;
        };

        this.logger.log(`[Azure FinOps] Coletando custos para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`);

        const azureCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
        const token = await azureCredential.getToken('https://management.azure.com/.default');

        if (!token?.token) {
            throw new Error('[Azure FinOps] Falha ao obter token do Azure AD');
        }

        const scope = `subscriptions/${subscriptionId}`;
        const apiVersion = '2023-11-01';
        const url = `https://management.azure.com/${scope}/providers/Microsoft.CostManagement/query?api-version=${apiVersion}`;

        const body = {
            type: 'ActualCost',
            timeframe: 'Custom',
            timePeriod: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
            dataset: {
                granularity,
                aggregation: {
                    totalCost: { name: 'Cost', function: 'Sum' },
                    totalUsage: { name: 'UsageQuantity', function: 'Sum' },
                },
                // 2 dimensões — evita estourar o limite de ~1000 linhas/página (SERVICE×REGION×Meter).
                grouping: [
                    { type: 'Dimension', name: 'ServiceName' },
                    { type: 'Dimension', name: 'ResourceLocation' },
                ],
            },
        };

        const pages = await this.fetchAllCostPages(url, token.token, body);
        const entries: FinopsCostCollectionResult['entries'] = [];
        let currency = 'USD';

        for (const data of pages) {
            const columns = data.properties?.columns ?? [];
            const rows = data.properties?.rows ?? [];
            const colIndex = (name: string) => columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());

            const costIdx = colIndex('Cost');
            const usageQtyIdx = colIndex('UsageQuantity');
            const serviceIdx = colIndex('ServiceName');
            const regionIdx = colIndex('ResourceLocation');
            const dateIdx = colIndex('UsageDate');
            const currencyIdx = colIndex('Currency');

            for (const row of rows) {
                const cost = Number(row[costIdx] ?? 0);

                // Zero = irrelevante. Créditos (negativos) entram no total líquido.
                if (cost === 0) continue;

                const rawDate = String(row[dateIdx] ?? startDate);
                const formattedDate =
                    rawDate.length === 8
                        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                        : rawDate;

                const rowCurrency = currencyIdx >= 0 ? String(row[currencyIdx] ?? 'USD') : 'USD';
                currency = rowCurrency;

                entries.push({
                    service: String(row[serviceIdx] ?? 'Unknown'),
                    resourceId: '',
                    region: regionIdx >= 0 ? (String(row[regionIdx] ?? '') || null) : null,
                    usageType: '',
                    operation: '',
                    cost,
                    currency: rowCurrency,
                    usageQuantity: usageQtyIdx >= 0 ? Number(row[usageQtyIdx] ?? 0) : 0,
                    usageUnit: '',
                    date: formattedDate,
                });
            }
        }

        this.logger.log(
            `[Azure FinOps] ${entries.length} registros coletados para conta ${cloudAccountId} (${pages.length} página(s))`,
        );

        return { entries, currency };
    }

    async collectResourceCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY',
    ): Promise<FinopsCostCollectionResult> {
        const { credentials, cloudAccountId } = creds;
        const { tenantId, clientId, clientSecret, subscriptionId } = credentials as {
            tenantId: string;
            clientId: string;
            clientSecret: string;
            subscriptionId: string;
        };

        this.logger.log(
            `[Azure FinOps] Coletando custos por recurso para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`,
        );

        const azureCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
        const token = await azureCredential.getToken('https://management.azure.com/.default');

        if (!token?.token) {
            throw new Error('[Azure FinOps] Falha ao obter token do Azure AD');
        }

        const scope = `subscriptions/${subscriptionId}`;
        const apiVersion = '2023-11-01';
        const url = `https://management.azure.com/${scope}/providers/Microsoft.CostManagement/query?api-version=${apiVersion}`;

        const body = {
            type: 'ActualCost',
            timeframe: 'Custom',
            timePeriod: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
            dataset: {
                granularity,
                aggregation: {
                    totalCost: { name: 'Cost', function: 'Sum' },
                    totalUsage: { name: 'UsageQuantity', function: 'Sum' },
                },
                grouping: [
                    { type: 'Dimension', name: 'ResourceId' },
                    { type: 'Dimension', name: 'ServiceName' },
                ],
            },
        };

        let pages: AzureCostQueryResult[];
        try {
            pages = await this.fetchAllCostPages(url, token.token, body);
        } catch (error) {
            this.logger.warn(
                `[Azure FinOps] collectResourceCosts falhou (continuando sem recursos): ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return { entries: [], currency: 'USD' };
        }

        const entries: FinopsCostCollectionResult['entries'] = [];
        let currency = 'USD';

        for (const data of pages) {
            const columns = data.properties?.columns ?? [];
            const rows = data.properties?.rows ?? [];
            const colIndex = (name: string) => columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());

            const costIdx = colIndex('Cost');
            const usageQtyIdx = colIndex('UsageQuantity');
            const serviceIdx = colIndex('ServiceName');
            const resourceIdx = colIndex('ResourceId');
            const dateIdx = colIndex('UsageDate');
            const currencyIdx = colIndex('Currency');

            for (const row of rows) {
                const cost = Number(row[costIdx] ?? 0);
                if (cost === 0) continue;

                const resourceId = resourceIdx >= 0 ? String(row[resourceIdx] ?? '').trim() : '';
                if (!resourceId) continue;

                const rawDate = String(row[dateIdx] ?? startDate);
                const formattedDate =
                    rawDate.length === 8
                        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                        : rawDate;

                const rowCurrency = currencyIdx >= 0 ? String(row[currencyIdx] ?? 'USD') : 'USD';
                currency = rowCurrency;

                entries.push({
                    service: String(row[serviceIdx] ?? 'Unknown'),
                    resourceId,
                    region: null,
                    usageType: '',
                    operation: '',
                    cost,
                    currency: rowCurrency,
                    usageQuantity: usageQtyIdx >= 0 ? Number(row[usageQtyIdx] ?? 0) : 0,
                    usageUnit: '',
                    date: formattedDate,
                });
            }
        }

        const capped = capResourceEntriesByDay(entries);
        this.logger.log(
            `[Azure FinOps] ${capped.length} registros por recurso coletados para conta ${cloudAccountId} (raw=${entries.length}, ${pages.length} página(s))`,
        );

        return { entries: capped, currency };
    }

    async collectCreditConsumption(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
    ): Promise<FinopsCreditConsumptionEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const { tenantId, clientId, clientSecret, subscriptionId } = credentials as {
            tenantId: string;
            clientId: string;
            clientSecret: string;
            subscriptionId: string;
        };

        this.logger.log(
            `[Azure FinOps] Coletando consumo de créditos para conta ${cloudAccountId} (${startDate} → ${endDate})`,
        );

        try {
            const token = await this.getAccessToken(tenantId, clientId, clientSecret);
            const scope = `subscriptions/${subscriptionId}`;
            const url = `https://management.azure.com/${scope}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`;

            const body = {
                type: 'ActualCost',
                timeframe: 'Custom',
                timePeriod: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
                dataset: {
                    granularity: 'Daily',
                    aggregation: {
                        totalCost: { name: 'Cost', function: 'Sum' },
                    },
                    filter: {
                        dimensions: {
                            name: 'ChargeType',
                            operator: 'In',
                            values: ['Purchase', 'Refund', 'Credit'],
                        },
                    },
                    grouping: [
                        { type: 'Dimension', name: 'ChargeType' },
                        { type: 'Dimension', name: 'PublisherType' },
                    ],
                },
            };

            const pages = await this.fetchAllCostPages(url, token, body);
            const entries: FinopsCreditConsumptionEntry[] = [];

            for (const data of pages) {
                const columns = data.properties?.columns ?? [];
                const rows = data.properties?.rows ?? [];
                const colIndex = (name: string) => columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
                const costIdx = colIndex('Cost');
                const chargeIdx = colIndex('ChargeType');
                const dateIdx = colIndex('UsageDate');
                const currencyIdx = colIndex('Currency');

                for (const row of rows) {
                    const cost = Number(row[costIdx] ?? 0);
                    const chargeType = String(row[chargeIdx] ?? 'Credit');
                    // Credits/refunds typically negative; also keep Purchase only if negative (promotional).
                    if (cost >= 0 && !/credit|refund/i.test(chargeType)) continue;
                    if (cost === 0) continue;

                    const rawDate = String(row[dateIdx] ?? startDate);
                    const formattedDate =
                        rawDate.length === 8
                            ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                            : rawDate.slice(0, 10);

                    entries.push({
                        date: formattedDate,
                        amount: Math.abs(cost),
                        currency: currencyIdx >= 0 ? String(row[currencyIdx] ?? 'USD') : 'USD',
                        label: chargeType || 'Credit',
                        rawMetadata: { chargeType, rawCost: cost },
                    });
                }
            }

            // Fallback: any negative cost lines if ChargeType filter yielded nothing
            if (entries.length === 0) {
                const fallbackBody = {
                    type: 'ActualCost',
                    timeframe: 'Custom',
                    timePeriod: { from: `${startDate}T00:00:00Z`, to: `${endDate}T23:59:59Z` },
                    dataset: {
                        granularity: 'Daily',
                        aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
                        grouping: [{ type: 'Dimension', name: 'ServiceName' }],
                    },
                };
                const fallbackPages = await this.fetchAllCostPages(url, token, fallbackBody);
                for (const data of fallbackPages) {
                    const columns = data.properties?.columns ?? [];
                    const rows = data.properties?.rows ?? [];
                    const colIndex = (name: string) =>
                        columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
                    const costIdx = colIndex('Cost');
                    const serviceIdx = colIndex('ServiceName');
                    const dateIdx = colIndex('UsageDate');
                    const currencyIdx = colIndex('Currency');
                    for (const row of rows) {
                        const cost = Number(row[costIdx] ?? 0);
                        if (cost >= 0) continue;
                        const rawDate = String(row[dateIdx] ?? startDate);
                        const formattedDate =
                            rawDate.length === 8
                                ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                                : rawDate.slice(0, 10);
                        entries.push({
                            date: formattedDate,
                            amount: Math.abs(cost),
                            currency: currencyIdx >= 0 ? String(row[currencyIdx] ?? 'USD') : 'USD',
                            label: String(row[serviceIdx] ?? 'Credit'),
                            rawMetadata: { rawCost: cost },
                        });
                    }
                }
            }

            this.logger.log(`[Azure FinOps] ${entries.length} entradas de crédito para ${cloudAccountId}`);
            return entries;
        } catch (error) {
            this.logger.warn(
                `[Azure FinOps] collectCreditConsumption falhou: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [];
        }
    }

    async collectCommitmentUtilization(
        creds: FinopsProviderCredentials,
        lookbackDays: number,
    ): Promise<FinopsCommitmentUtilizationEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const { tenantId, clientId, clientSecret, subscriptionId } = credentials as {
            tenantId: string;
            clientId: string;
            clientSecret: string;
            subscriptionId: string;
        };

        const { startDate, endDate } = this.lookbackRange(lookbackDays);
        this.logger.log(
            `[Azure FinOps] Coletando utilização de Reservations para ${cloudAccountId} (${startDate} → ${endDate})`,
        );

        try {
            const token = await this.getAccessToken(tenantId, clientId, clientSecret);
            const grain = 'daily';
            const url =
                `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Consumption/reservationSummaries` +
                `?api-version=2023-05-01&$filter=properties/usageDate ge ${startDate} AND properties/usageDate le ${endDate}` +
                `&grain=${grain}`;

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                const body = await response.text();
                this.logger.warn(`[Azure FinOps] reservationSummaries ${response.status}: ${body}`);
                return [];
            }

            const payload = (await response.json()) as {
                value?: Array<{
                    id?: string;
                    name?: string;
                    properties?: {
                        reservationOrderId?: string;
                        reservationId?: string;
                        skuName?: string;
                        reservedHours?: number;
                        usedHours?: number;
                        avgUtilizationPercentage?: number;
                        usageDate?: string;
                    };
                }>;
            };

            const byReservation = new Map<
                string,
                { name: string; utilSum: number; utilCount: number; reserved: number; used: number }
            >();

            for (const item of payload.value ?? []) {
                const props = item.properties ?? {};
                const key = props.reservationId || item.id || item.name || 'unknown';
                const current = byReservation.get(key) ?? {
                    name: props.skuName || key,
                    utilSum: 0,
                    utilCount: 0,
                    reserved: 0,
                    used: 0,
                };
                if (props.avgUtilizationPercentage != null) {
                    current.utilSum += Number(props.avgUtilizationPercentage);
                    current.utilCount += 1;
                }
                current.reserved += Number(props.reservedHours ?? 0);
                current.used += Number(props.usedHours ?? 0);
                byReservation.set(key, current);
            }

            const entries: FinopsCommitmentUtilizationEntry[] = [];
            for (const [externalId, agg] of byReservation) {
                const utilizationPercent = agg.utilCount > 0 ? agg.utilSum / agg.utilCount : null;
                const unused = Math.max(0, agg.reserved - agg.used);
                entries.push({
                    commitmentType: 'reservation',
                    externalId,
                    name: agg.name,
                    utilizationPercent,
                    coveragePercent: null,
                    usedCommitment: agg.used,
                    unusedCommitment: unused,
                    hourlyCommitment: null,
                    monthlyCommitment: null,
                    term: null,
                    currency: 'USD',
                    lookbackDays,
                    rawMetadata: { reservedHours: agg.reserved, usedHours: agg.used },
                });
            }

            // Aggregate rollup when we have details
            if (entries.length > 1) {
                const utilValues = entries
                    .map((e) => e.utilizationPercent)
                    .filter((v): v is number => v != null);
                const avgUtil =
                    utilValues.length > 0 ? utilValues.reduce((a, b) => a + b, 0) / utilValues.length : null;
                const used = entries.reduce((s, e) => s + (e.usedCommitment ?? 0), 0);
                const unused = entries.reduce((s, e) => s + (e.unusedCommitment ?? 0), 0);
                entries.unshift({
                    commitmentType: 'reservation',
                    externalId: `reservation-aggregate-${cloudAccountId}`,
                    name: 'Reservations (aggregate)',
                    utilizationPercent: avgUtil,
                    coveragePercent: null,
                    usedCommitment: used,
                    unusedCommitment: unused,
                    hourlyCommitment: null,
                    monthlyCommitment: null,
                    term: null,
                    currency: 'USD',
                    lookbackDays,
                });
            }

            this.logger.log(`[Azure FinOps] ${entries.length} snapshot(s) RI para ${cloudAccountId}`);
            return entries;
        } catch (error) {
            this.logger.warn(
                `[Azure FinOps] collectCommitmentUtilization falhou: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [];
        }
    }

    async collectCommitmentRecommendations(
        creds: FinopsProviderCredentials,
        lookbackDays: number,
    ): Promise<FinopsCommitmentRecommendationEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const { tenantId, clientId, clientSecret, subscriptionId } = credentials as {
            tenantId: string;
            clientId: string;
            clientSecret: string;
            subscriptionId: string;
        };

        this.logger.log(`[Azure FinOps] Coletando recomendações de Reservations para ${cloudAccountId}`);

        try {
            const token = await this.getAccessToken(tenantId, clientId, clientSecret);
            // Shared scope recommendations for the subscription
            const url =
                `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Consumption/reservationRecommendations` +
                `?api-version=2023-05-01`;

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                const body = await response.text();
                this.logger.warn(`[Azure FinOps] reservationRecommendations ${response.status}: ${body}`);
                return [
                    {
                        commitmentType: 'reservation',
                        recommendationKey: `reservation:none:${lookbackDays}`,
                        lookbackDays,
                        term: null,
                        paymentOption: null,
                        estimatedMonthlySavings: null,
                        estimatedSavingsPercentage: null,
                        recommendedHourlyCommitment: null,
                        eligible: false,
                        ineligibleReason:
                            'API de recomendações de Reservations indisponível ou sem permissão (Reader de Reservations / Consumption).',
                        summary: 'Sem recomendações disponíveis',
                        currency: 'USD',
                    },
                ];
            }

            const payload = (await response.json()) as {
                value?: Array<{
                    id?: string;
                    name?: string;
                    sku?: string;
                    location?: string;
                    properties?: {
                        lookBackPeriod?: string;
                        term?: string;
                        costWithNoReservedInstances?: number;
                        totalCostWithReservedInstances?: number;
                        netSavings?: number;
                        recommendedQuantity?: number;
                        scope?: string;
                        skuProperties?: unknown;
                    };
                }>;
            };

            const entries: FinopsCommitmentRecommendationEntry[] = [];
            for (const item of payload.value ?? []) {
                const props = item.properties ?? {};
                const netSavings = props.netSavings != null ? Number(props.netSavings) : null;
                const eligible = (netSavings ?? 0) > 0 && (props.recommendedQuantity ?? 0) > 0;
                const term = props.term ?? null;
                const key = `reservation:${item.sku ?? item.name ?? 'sku'}:${term ?? 'na'}:${props.lookBackPeriod ?? lookbackDays}`;

                entries.push({
                    commitmentType: 'reservation',
                    recommendationKey: key.slice(0, 250),
                    lookbackDays,
                    term,
                    paymentOption: props.scope ?? null,
                    estimatedMonthlySavings: netSavings,
                    estimatedSavingsPercentage: null,
                    recommendedHourlyCommitment: null,
                    eligible,
                    ineligibleReason: eligible
                        ? null
                        : 'SKU já coberto ou economia estimada insuficiente para justificar nova Reservation.',
                    summary: `${item.sku ?? item.name ?? 'Reservation'} — qty ${props.recommendedQuantity ?? 0}`,
                    currency: 'USD',
                    rawMetadata: {
                        location: item.location,
                        recommendedQuantity: props.recommendedQuantity,
                        costWithNoReservedInstances: props.costWithNoReservedInstances,
                        totalCostWithReservedInstances: props.totalCostWithReservedInstances,
                    },
                });
            }

            if (entries.length === 0) {
                entries.push({
                    commitmentType: 'reservation',
                    recommendationKey: `reservation:none:${lookbackDays}`,
                    lookbackDays,
                    term: null,
                    paymentOption: null,
                    estimatedMonthlySavings: null,
                    estimatedSavingsPercentage: null,
                    recommendedHourlyCommitment: null,
                    eligible: false,
                    ineligibleReason:
                        'Nenhuma Reservation adicional recomendada — uso já coberto ou sem histórico elegível.',
                    summary: 'Sem recomendações elegíveis',
                    currency: 'USD',
                });
            }

            return entries;
        } catch (error) {
            this.logger.warn(
                `[Azure FinOps] collectCommitmentRecommendations falhou: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [];
        }
    }

    /**
     * Fim do mês como no portal: soma das linhas Actual + Forecast do Cost Management.
     * A API só cobre o mês corrente; meses seguintes continuam na projeção linear.
     */
    async forecastMonthEnd(creds: FinopsProviderCredentials): Promise<ProviderCostForecast> {
        const today = new Date().toISOString().slice(0, 10);
        const cacheKey = `${creds.cloudAccountId}:${today}:month-end`;
        const cached = readForecastCache<ProviderCostForecast>(cacheKey);
        if (cached) return cached;

        const { tenantId, clientId, clientSecret, subscriptionId } = creds.credentials as {
            tenantId?: string;
            clientId?: string;
            clientSecret?: string;
            subscriptionId?: string;
        };
        if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
            throw new Error('[Azure FinOps] Credencial incompleta para o forecast.');
        }

        const token = await this.getAccessToken(tenantId, clientId, clientSecret);
        const [year, month] = today.split('-').map(Number);
        const monthStart = `${today.slice(0, 7)}-01`;
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const monthEnd = `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
        const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/forecast?api-version=2023-11-01`;
        const body = {
            type: 'ActualCost',
            timeframe: 'Custom',
            timePeriod: { from: `${monthStart}T00:00:00Z`, to: `${monthEnd}T23:59:59Z` },
            dataset: {
                granularity: 'Daily',
                aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
            },
            includeActualCost: true,
            includeFreshPartialCost: true,
        };

        const pages = await this.fetchAllCostPages(url, token, body);
        let amount = 0;
        let currency = 'USD';
        let sawCost = false;
        for (const data of pages) {
            const columns = data.properties?.columns ?? [];
            const rows = data.properties?.rows ?? [];
            const colIndex = (name: string) => columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase());
            const costIdx = colIndex('Cost') >= 0 ? colIndex('Cost') : colIndex('PreTaxCost');
            const currencyIdx = colIndex('Currency');
            if (costIdx < 0) continue;
            sawCost = true;
            for (const row of rows) {
                const cost = Number(row[costIdx] ?? 0);
                if (!Number.isFinite(cost)) continue;
                amount += cost;
                if (currencyIdx >= 0 && row[currencyIdx]) currency = String(row[currencyIdx]);
            }
        }

        if (!sawCost || !Number.isFinite(amount)) {
            throw new Error('[Azure FinOps] Forecast sem coluna de custo.');
        }

        const forecast = { amount: Math.round(amount * 100) / 100, currency: currency.toUpperCase() };
        writeForecastCache(cacheKey, forecast);
        this.logger.log(`[Azure FinOps] Forecast de ${creds.cloudAccountId}: ${forecast.amount.toFixed(2)} ${forecast.currency}`);
        return forecast;
    }

    private async getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
        const azureCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
        const token = await azureCredential.getToken('https://management.azure.com/.default');
        if (!token?.token) {
            throw new Error('[Azure FinOps] Falha ao obter token do Azure AD');
        }
        return token.token;
    }

    private lookbackRange(lookbackDays: number): { startDate: string; endDate: string } {
        const end = new Date();
        end.setUTCHours(0, 0, 0, 0);
        const inclusiveEnd = new Date(end);
        inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
        const start = new Date(inclusiveEnd);
        start.setUTCDate(start.getUTCDate() - (lookbackDays - 1));
        return {
            startDate: start.toISOString().slice(0, 10),
            endDate: inclusiveEnd.toISOString().slice(0, 10),
        };
    }

    /**
     * Cost Management Query pagina em ~1000 linhas via nextLink.
     * Sem seguir o nextLink o total mensal fica truncado.
     */
    private async fetchAllCostPages(
        initialUrl: string,
        accessToken: string,
        body: Record<string, unknown>,
    ): Promise<AzureCostQueryResult[]> {
        const pages: AzureCostQueryResult[] = [];
        let url: string | undefined = initialUrl;
        let pageCount = 0;
        const maxPages = 100;
        const payload = JSON.stringify(body);

        while (url && pageCount < maxPages) {
            pageCount += 1;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                // Docs Azure: reenviar o mesmo body em cada página do nextLink.
                body: payload,
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`[Azure FinOps] Falha na API Cost Management (${response.status}): ${errorBody}`);
            }

            const data = (await response.json()) as AzureCostQueryResult;
            pages.push(data);
            url = data.properties?.nextLink || data.nextLink;
        }

        if (pageCount >= maxPages) {
            this.logger.warn(`[Azure FinOps] Limite de ${maxPages} páginas atingido — resultados podem estar incompletos.`);
        }

        return pages;
    }
}
