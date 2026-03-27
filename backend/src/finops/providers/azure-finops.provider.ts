import { Injectable, Logger } from '@nestjs/common';

import { ClientSecretCredential } from '@azure/identity';

import type { IFinopsProvider, FinopsCostCollectionResult, FinopsProviderCredentials } from './finops-provider.interface';

interface AzureCostQueryColumn {
    name: string;
    type: string;
}

interface AzureCostQueryRow {
    [index: number]: string | number;
}

interface AzureCostQueryResult {
    properties?: {
        columns?: AzureCostQueryColumn[];
        rows?: AzureCostQueryRow[];
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
            throw new Error('[Azure FinOps] Falha ao obter token de acesso do Azure AD');
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
                },
                grouping: [
                    { type: 'Dimension', name: 'ServiceName' },
                    { type: 'Dimension', name: 'ResourceLocation' },
                ],
            },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`[Azure FinOps] Falha na API Cost Management (${response.status}): ${errorBody}`);
        }

        const data = (await response.json()) as AzureCostQueryResult;

        const columns = data.properties?.columns ?? [];
        const rows = data.properties?.rows ?? [];

        const colIndex = (name: string) => columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());

        const costIdx = colIndex('Cost');
        const serviceIdx = colIndex('ServiceName');
        const regionIdx = colIndex('ResourceLocation');
        const dateIdx = colIndex('UsageDate');
        const currencyIdx = colIndex('Currency');

        const entries: Array<{ service: string; region: string | null; cost: number; currency: string; date: string }> = [];
        let currency = 'USD';

        for (const row of rows) {
            const cost = Number(row[costIdx] ?? 0);

            if (cost <= 0) {
                continue;
            }

            const rawDate = String(row[dateIdx] ?? startDate);
            // Azure retorna datas no formato YYYYMMDD (daily) ou YYYY-MM-01 (monthly)
            const formattedDate = rawDate.length === 8
                ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                : rawDate;

            const rowCurrency = currencyIdx >= 0 ? String(row[currencyIdx] ?? 'USD') : 'USD';
            currency = rowCurrency;

            entries.push({
                service: String(row[serviceIdx] ?? 'Unknown'),
                region: regionIdx >= 0 ? (String(row[regionIdx] ?? '') || null) : null,
                cost,
                currency: rowCurrency,
                date: formattedDate,
            });
        }

        this.logger.log(`[Azure FinOps] ${entries.length} registros coletados para conta ${cloudAccountId}`);

        return { entries, currency };
    }
}
