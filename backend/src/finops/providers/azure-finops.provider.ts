import { Injectable, Logger } from '@nestjs/common';

import { ClientSecretCredential } from '@azure/identity';

import type { IFinopsProvider, FinopsCostCollectionResult, FinopsProviderCredentials } from './finops-provider.interface';
import { capResourceEntriesByDay } from './finops-provider.interface';

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
