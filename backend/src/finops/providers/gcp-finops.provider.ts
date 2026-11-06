import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { google, bigquery_v2 } from 'googleapis';

import type {
    IFinopsProvider,
    FinopsCommitmentRecommendationEntry,
    FinopsCommitmentUtilizationEntry,
    FinopsCostCollectionResult,
    FinopsCostEntry,
    FinopsCreditConsumptionEntry,
    FinopsProviderCredentials,
} from './finops-provider.interface';
import { capResourceEntriesByDay } from './finops-provider.interface';

type GcpFinopsCredentials = {
    projectId: string;
    serviceAccountEmail: string;
    /** Projeto onde está o export (default = projectId). */
    billingExportProjectId?: string;
    /** Dataset do Cloud Billing export (auto-descoberta se omitido). */
    billingExportDataset?: string;
    /** Tabela do export (auto-descoberta se omitido). */
    billingExportTable?: string;
};

/**
 * Coleta custos GCP via BigQuery Billing Export — equivalente ao Cost Explorer da AWS.
 *
 * Pré-requisitos no projeto do cliente:
 *  - Cloud Billing export para BigQuery habilitado
 *  - SA impersonada com bigquery.jobs.create + bigquery.dataViewer no dataset
 *
 * Agrupa por service.description + location.region (mesmo contrato SERVICE+REGION da AWS).
 */
@Injectable()
export class GcpFinopsProvider implements IFinopsProvider {
    readonly provider = 'gcp';

    private readonly logger = new Logger(GcpFinopsProvider.name);

    constructor(private readonly configService: ConfigService) {}

    async collectCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY'
    ): Promise<FinopsCostCollectionResult> {
        const { credentials, cloudAccountId } = creds;
        const gcpCreds = credentials as GcpFinopsCredentials;

        if (!gcpCreds.projectId || !gcpCreds.serviceAccountEmail) {
            throw new BadRequestException('Credenciais GCP inválidas: projectId e serviceAccountEmail são obrigatórios.');
        }

        this.logger.log(`[GCP FinOps] Coletando custos para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`);

        const auth = await this.buildImpersonatedAuth(gcpCreds.serviceAccountEmail);
        const bigquery = google.bigquery({ version: 'v2', auth: auth as never });

        const exportProjectId = gcpCreds.billingExportProjectId || gcpCreds.projectId;
        const { datasetId, tableId } = await this.resolveBillingExportTable(bigquery, exportProjectId, gcpCreds);

        const exclusiveEndDate = this.toExclusiveEndDate(endDate);
        const dateExpr =
            granularity === 'MONTHLY'
                ? `FORMAT_DATE('%Y-%m-01', DATE(usage_start_time))`
                : `FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time))`;

        const query = `
            SELECT
              ${dateExpr} AS usage_date,
              COALESCE(service.description, 'Unknown') AS service,
              COALESCE(location.region, location.location, '') AS region,
              SUM(cost) AS cost,
              COALESCE(ANY_VALUE(currency), 'USD') AS currency,
              SUM(IFNULL(usage.amount, 0)) AS usage_quantity,
              COALESCE(ANY_VALUE(usage.unit), '') AS usage_unit
            FROM \`${exportProjectId}.${datasetId}.${tableId}\`
            WHERE DATE(usage_start_time) >= @startDate
              AND DATE(usage_start_time) < @endDate
              AND project.id = @projectId
            GROUP BY usage_date, service, region
            HAVING cost != 0
            ORDER BY usage_date ASC, cost DESC
        `;

        const rows = await this.runQuery(bigquery, exportProjectId, query, {
            startDate: { type: 'STRING', value: startDate },
            endDate: { type: 'STRING', value: exclusiveEndDate },
            projectId: { type: 'STRING', value: gcpCreds.projectId },
        });

        const entries: FinopsCostEntry[] = [];
        let currency = 'USD';

        for (const row of rows) {
            const amount = Number(row.cost ?? 0);
            if (amount === 0) continue;

            if (amount < 0) {
                this.logger.log(
                    `[GCP FinOps] Crédito detectado: service="${row.service}", region="${row.region}", valor=${amount}`
                );
            }

            currency = String(row.currency || currency);

            entries.push({
                service: String(row.service || 'Unknown'),
                resourceId: '',
                region: row.region ? String(row.region) : null,
                usageType: '',
                operation: '',
                cost: amount,
                currency,
                usageQuantity: Number(row.usage_quantity ?? 0),
                usageUnit: String(row.usage_unit ?? ''),
                date: String(row.usage_date),
            });
        }

        this.logger.log(`[GCP FinOps] ${entries.length} registros coletados para conta ${cloudAccountId}`);

        return { entries, currency };
    }

    async collectResourceCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY',
    ): Promise<FinopsCostCollectionResult> {
        const { credentials, cloudAccountId } = creds;
        const gcpCreds = credentials as GcpFinopsCredentials;

        if (!gcpCreds.projectId || !gcpCreds.serviceAccountEmail) {
            throw new BadRequestException('Credenciais GCP inválidas: projectId e serviceAccountEmail são obrigatórios.');
        }

        this.logger.log(
            `[GCP FinOps] Coletando custos por recurso para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`,
        );

        const auth = await this.buildImpersonatedAuth(gcpCreds.serviceAccountEmail);
        const bigquery = google.bigquery({ version: 'v2', auth: auth as never });

        const exportProjectId = gcpCreds.billingExportProjectId || gcpCreds.projectId;
        const { datasetId, tableId } = await this.resolveBillingExportTable(bigquery, exportProjectId, gcpCreds);

        if (!tableId.startsWith('gcp_billing_export_resource_v1_')) {
            this.logger.warn(
                `[GCP FinOps] Export "${tableId}" não é detailed/resource — collectResourceCosts retorna vazio.`,
            );
            return { entries: [], currency: 'USD' };
        }

        const exclusiveEndDate = this.toExclusiveEndDate(endDate);
        const dateExpr =
            granularity === 'MONTHLY'
                ? `FORMAT_DATE('%Y-%m-01', DATE(usage_start_time))`
                : `FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time))`;

        const query = `
            SELECT
              ${dateExpr} AS usage_date,
              COALESCE(service.description, 'Unknown') AS service,
              COALESCE(location.region, location.location, '') AS region,
              COALESCE(resource.global_name, resource.name, '') AS resource_id,
              SUM(cost) AS cost,
              COALESCE(ANY_VALUE(currency), 'USD') AS currency,
              SUM(IFNULL(usage.amount, 0)) AS usage_quantity,
              COALESCE(ANY_VALUE(usage.unit), '') AS usage_unit
            FROM \`${exportProjectId}.${datasetId}.${tableId}\`
            WHERE DATE(usage_start_time) >= @startDate
              AND DATE(usage_start_time) < @endDate
              AND project.id = @projectId
              AND COALESCE(resource.global_name, resource.name, '') != ''
            GROUP BY usage_date, service, region, resource_id
            HAVING cost != 0
            ORDER BY usage_date ASC, cost DESC
        `;

        const rows = await this.runQuery(bigquery, exportProjectId, query, {
            startDate: { type: 'STRING', value: startDate },
            endDate: { type: 'STRING', value: exclusiveEndDate },
            projectId: { type: 'STRING', value: gcpCreds.projectId },
        });

        const entries: FinopsCostEntry[] = [];
        let currency = 'USD';

        for (const row of rows) {
            const amount = Number(row.cost ?? 0);
            if (amount === 0) continue;

            const resourceId = String(row.resource_id ?? '').trim();
            if (!resourceId) continue;

            currency = String(row.currency || currency);

            entries.push({
                service: String(row.service || 'Unknown'),
                resourceId,
                region: row.region ? String(row.region) : null,
                usageType: '',
                operation: '',
                cost: amount,
                currency,
                usageQuantity: Number(row.usage_quantity ?? 0),
                usageUnit: String(row.usage_unit ?? ''),
                date: String(row.usage_date),
            });
        }

        const capped = capResourceEntriesByDay(entries);
        this.logger.log(
            `[GCP FinOps] ${capped.length} registros por recurso coletados para conta ${cloudAccountId} (raw=${entries.length})`,
        );

        return { entries: capped, currency };
    }

    async collectCreditConsumption(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
    ): Promise<FinopsCreditConsumptionEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const gcpCreds = credentials as GcpFinopsCredentials;
        if (!gcpCreds.projectId || !gcpCreds.serviceAccountEmail) {
            throw new BadRequestException('Credenciais GCP inválidas: projectId e serviceAccountEmail são obrigatórios.');
        }

        this.logger.log(
            `[GCP FinOps] Coletando consumo de créditos para conta ${cloudAccountId} (${startDate} → ${endDate})`,
        );

        try {
            const auth = await this.buildImpersonatedAuth(gcpCreds.serviceAccountEmail);
            const bigquery = google.bigquery({ version: 'v2', auth: auth as never });
            const exportProjectId = gcpCreds.billingExportProjectId || gcpCreds.projectId;
            const { datasetId, tableId } = await this.resolveBillingExportTable(bigquery, exportProjectId, gcpCreds);
            const exclusiveEndDate = this.toExclusiveEndDate(endDate);

            const query = `
                SELECT
                  FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time)) AS usage_date,
                  COALESCE(credit.type, credit.name, 'Credit') AS credit_label,
                  SUM(ABS(IFNULL(credit.amount, 0))) AS amount,
                  COALESCE(ANY_VALUE(currency), 'USD') AS currency
                FROM \`${exportProjectId}.${datasetId}.${tableId}\`,
                UNNEST(IFNULL(credits, [])) AS credit
                WHERE DATE(usage_start_time) >= @startDate
                  AND DATE(usage_start_time) < @endDate
                  AND project.id = @projectId
                  AND IFNULL(credit.amount, 0) != 0
                GROUP BY usage_date, credit_label
                HAVING amount > 0
                ORDER BY usage_date ASC
            `;

            const rows = await this.runQuery(bigquery, exportProjectId, query, {
                startDate: { type: 'STRING', value: startDate },
                endDate: { type: 'STRING', value: exclusiveEndDate },
                projectId: { type: 'STRING', value: gcpCreds.projectId },
            });

            const entries: FinopsCreditConsumptionEntry[] = rows.map((row) => ({
                date: String(row.usage_date),
                amount: Number(row.amount ?? 0),
                currency: String(row.currency || 'USD'),
                label: String(row.credit_label || 'Credit'),
                rawMetadata: { source: 'billing_export_credits' },
            }));

            this.logger.log(`[GCP FinOps] ${entries.length} entradas de crédito para ${cloudAccountId}`);
            return entries;
        } catch (error) {
            this.logger.warn(
                `[GCP FinOps] collectCreditConsumption falhou: ${
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
        const gcpCreds = credentials as GcpFinopsCredentials;
        if (!gcpCreds.projectId || !gcpCreds.serviceAccountEmail) {
            throw new BadRequestException('Credenciais GCP inválidas: projectId e serviceAccountEmail são obrigatórios.');
        }

        const { startDate, endDate } = this.lookbackRange(lookbackDays);
        this.logger.log(
            `[GCP FinOps] Coletando utilização de CUDs para ${cloudAccountId} (${startDate} → ${endDate})`,
        );

        try {
            const auth = await this.buildImpersonatedAuth(gcpCreds.serviceAccountEmail);
            const bigquery = google.bigquery({ version: 'v2', auth: auth as never });
            const exportProjectId = gcpCreds.billingExportProjectId || gcpCreds.projectId;
            const { datasetId, tableId } = await this.resolveBillingExportTable(bigquery, exportProjectId, gcpCreds);
            const exclusiveEndDate = this.toExclusiveEndDate(endDate);

            // Approximate CUD utilization from billing credits of type COMMITTED_USAGE_DISCOUNT*
            const query = `
                SELECT
                  COALESCE(credit.type, 'COMMITTED_USAGE_DISCOUNT') AS cud_type,
                  SUM(ABS(IFNULL(credit.amount, 0))) AS credit_amount,
                  SUM(IFNULL(cost, 0)) AS total_cost,
                  COALESCE(ANY_VALUE(currency), 'USD') AS currency
                FROM \`${exportProjectId}.${datasetId}.${tableId}\`
                LEFT JOIN UNNEST(IFNULL(credits, [])) AS credit
                WHERE DATE(usage_start_time) >= @startDate
                  AND DATE(usage_start_time) < @endDate
                  AND project.id = @projectId
                GROUP BY cud_type
            `;

            const rows = await this.runQuery(bigquery, exportProjectId, query, {
                startDate: { type: 'STRING', value: startDate },
                endDate: { type: 'STRING', value: exclusiveEndDate },
                projectId: { type: 'STRING', value: gcpCreds.projectId },
            });

            let cudCredits = 0;
            let totalCost = 0;
            let currency = 'USD';
            const cudTypes: string[] = [];

            for (const row of rows) {
                const type = String(row.cud_type || '');
                currency = String(row.currency || currency);
                totalCost += Number(row.total_cost ?? 0);
                if (/COMMITTED_USAGE_DISCOUNT|SUSTAINED_USAGE_DISCOUNT/i.test(type)) {
                    cudCredits += Number(row.credit_amount ?? 0);
                    cudTypes.push(type);
                }
            }

            if (cudCredits <= 0 && totalCost <= 0) {
                return [];
            }

            // Without explicit commitment hours, treat credit share of spend as coverage proxy.
            const coveragePercent =
                totalCost > 0 ? Math.min(100, (cudCredits / Math.abs(totalCost)) * 100) : null;

            return [
                {
                    commitmentType: 'cud',
                    externalId: `cud-aggregate-${cloudAccountId}`,
                    name: 'Committed Use Discounts (aggregate)',
                    utilizationPercent: coveragePercent != null && coveragePercent > 0 ? 100 : null,
                    coveragePercent,
                    usedCommitment: cudCredits,
                    unusedCommitment: null,
                    hourlyCommitment: null,
                    monthlyCommitment: cudCredits,
                    term: null,
                    currency,
                    lookbackDays,
                    rawMetadata: { cudTypes, startDate, endDate, totalCost },
                },
            ];
        } catch (error) {
            this.logger.warn(
                `[GCP FinOps] collectCommitmentUtilization falhou: ${
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
        const gcpCreds = credentials as GcpFinopsCredentials;
        if (!gcpCreds.projectId || !gcpCreds.serviceAccountEmail) {
            throw new BadRequestException('Credenciais GCP inválidas: projectId e serviceAccountEmail são obrigatórios.');
        }

        this.logger.log(`[GCP FinOps] Coletando recomendações de CUD (Recommender) para ${cloudAccountId}`);

        try {
            const auth = await this.buildImpersonatedAuth(gcpCreds.serviceAccountEmail);
            const recommender = google.recommender({ version: 'v1', auth: auth as never });
            const parent =
                `projects/${gcpCreds.projectId}/locations/global/recommenders/` +
                `google.compute.commitment.UsageCommitmentRecommender`;

            const response = await recommender.projects.locations.recommenders.recommendations.list({
                parent,
                pageSize: 50,
            });

            const recommendations = response.data.recommendations ?? [];
            const entries: FinopsCommitmentRecommendationEntry[] = [];

            for (const rec of recommendations) {
                const name = rec.name ?? `cud-rec-${entries.length}`;
                const key = name.split('/').pop() || name;
                const primaryImpact = rec.primaryImpact;
                const costProjection = primaryImpact?.costProjection;
                const units = Number(costProjection?.cost?.units ?? 0);
                const nanos = Number(costProjection?.cost?.nanos ?? 0) / 1e9;
                // Recommender cost impact for savings is typically negative.
                const monthlySavings = Math.abs(units + nanos);
                const state = rec.stateInfo?.state ?? null;
                const eligible = monthlySavings > 0 && (state === 'ACTIVE' || !state);

                entries.push({
                    commitmentType: 'cud',
                    recommendationKey: key.slice(0, 250),
                    lookbackDays,
                    term: null,
                    paymentOption: null,
                    estimatedMonthlySavings: monthlySavings || null,
                    estimatedSavingsPercentage: null,
                    recommendedHourlyCommitment: null,
                    eligible,
                    ineligibleReason: eligible
                        ? null
                        : 'Recomendação inativa ou sem economia estimada — uso pode não ser elegível a CUD.',
                    summary: rec.description ?? 'CUD recommendation',
                    currency: costProjection?.cost?.currencyCode ?? 'USD',
                    rawMetadata: {
                        state,
                        recommenderSubtype: rec.recommenderSubtype,
                        priority: rec.priority,
                    },
                });
            }

            if (entries.length === 0) {
                entries.push({
                    commitmentType: 'cud',
                    recommendationKey: `cud:none:${lookbackDays}`,
                    lookbackDays,
                    term: null,
                    paymentOption: null,
                    estimatedMonthlySavings: null,
                    estimatedSavingsPercentage: null,
                    recommendedHourlyCommitment: null,
                    eligible: false,
                    ineligibleReason:
                        'Nenhuma recomendação CUD ativa (Recommender vazio, sem permissão recommender.viewer, ou uso não elegível).',
                    summary: 'Sem recomendações disponíveis',
                    currency: 'USD',
                });
            }

            return entries;
        } catch (error) {
            this.logger.warn(
                `[GCP FinOps] collectCommitmentRecommendations falhou: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [
                {
                    commitmentType: 'cud',
                    recommendationKey: `cud:error:${lookbackDays}`,
                    lookbackDays,
                    term: null,
                    paymentOption: null,
                    estimatedMonthlySavings: null,
                    estimatedSavingsPercentage: null,
                    recommendedHourlyCommitment: null,
                    eligible: false,
                    ineligibleReason: `Falha ao consultar Recommender: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                    summary: 'Sem recomendações disponíveis',
                    currency: 'USD',
                },
            ];
        }
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

    private async resolveBillingExportTable(
        bigquery: bigquery_v2.Bigquery,
        projectId: string,
        creds: GcpFinopsCredentials
    ): Promise<{ datasetId: string; tableId: string }> {
        if (creds.billingExportDataset && creds.billingExportTable) {
            return { datasetId: creds.billingExportDataset, tableId: creds.billingExportTable };
        }

        const datasetsResponse = await bigquery.datasets.list({ projectId, maxResults: 100 });
        const datasets = datasetsResponse.data.datasets ?? [];

        if (creds.billingExportDataset) {
            const tablesResponse = await bigquery.tables.list({
                projectId,
                datasetId: creds.billingExportDataset,
                maxResults: 100,
            });
            const tableId = this.pickBillingExportTable(
                (tablesResponse.data.tables ?? []).map((t) => t.tableReference?.tableId ?? '')
            );
            if (!tableId) {
                throw new BadRequestException(
                    `Nenhuma tabela de Cloud Billing export encontrada no dataset "${creds.billingExportDataset}". ` +
                        'Habilite o export detalhado/padrão para BigQuery no Cloud Billing.'
                );
            }
            return { datasetId: creds.billingExportDataset, tableId };
        }

        for (const dataset of datasets) {
            const datasetId = dataset.datasetReference?.datasetId;
            if (!datasetId) continue;

            const tablesResponse = await bigquery.tables.list({ projectId, datasetId, maxResults: 100 });
            const tableIds = (tablesResponse.data.tables ?? []).map((t) => t.tableReference?.tableId ?? '');
            const tableId = this.pickBillingExportTable(tableIds);
            if (tableId) {
                this.logger.log(`[GCP FinOps] Export encontrado: ${projectId}.${datasetId}.${tableId}`);
                return { datasetId, tableId };
            }
        }

        throw new BadRequestException(
            'Cloud Billing export para BigQuery não encontrado neste projeto. ' +
                'Habilite o export de custos (padrão ou detalhado) no Cloud Billing e conceda à service account ' +
                'as roles bigquery.jobUser e bigquery.dataViewer no dataset. ' +
                'Opcionalmente informe billingExportDataset/billingExportTable nas credenciais da conta.'
        );
    }

    private pickBillingExportTable(tableIds: string[]): string | null {
        const detailed = tableIds.find((id) => id.startsWith('gcp_billing_export_resource_v1_'));
        if (detailed) return detailed;
        const standard = tableIds.find((id) => id.startsWith('gcp_billing_export_v1_'));
        return standard ?? null;
    }

    private async runQuery(
        bigquery: bigquery_v2.Bigquery,
        projectId: string,
        query: string,
        params: Record<string, { type: string; value: string }>
    ): Promise<Array<Record<string, unknown>>> {
        const queryParams = Object.entries(params).map(([name, param]) => ({
            name,
            parameterType: { type: param.type },
            parameterValue: { value: param.value },
        }));

        const insertResponse = await bigquery.jobs.query({
            projectId,
            requestBody: {
                query,
                useLegacySql: false,
                parameterMode: 'NAMED',
                queryParameters: queryParams,
                timeoutMs: 60000,
                maxResults: 100000,
            },
        });

        const jobId = insertResponse.data.jobReference?.jobId;
        let rows = insertResponse.data.rows ?? [];
        let schemaFields = insertResponse.data.schema?.fields ?? [];
        let pageToken = insertResponse.data.pageToken;
        let jobComplete = insertResponse.data.jobComplete === true;

        // Poll até completar se a query for longa
        while (!jobComplete && jobId) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const getResponse = await bigquery.jobs.getQueryResults({
                projectId,
                jobId,
                maxResults: 100000,
            });
            jobComplete = getResponse.data.jobComplete === true;
            if (jobComplete) {
                rows = getResponse.data.rows ?? [];
                schemaFields = getResponse.data.schema?.fields ?? [];
                pageToken = getResponse.data.pageToken;
            }
        }

        if (!jobComplete) {
            throw new Error('[GCP FinOps] Timeout aguardando resultado da query BigQuery.');
        }

        if (insertResponse.data.errors?.length) {
            throw new Error(`[GCP FinOps] Erro BigQuery: ${JSON.stringify(insertResponse.data.errors)}`);
        }

        const allRows = [...rows];
        while (pageToken && jobId) {
            const page = await bigquery.jobs.getQueryResults({
                projectId,
                jobId,
                pageToken,
                maxResults: 100000,
            });
            allRows.push(...(page.data.rows ?? []));
            pageToken = page.data.pageToken;
        }

        const fieldNames = schemaFields.map((f) => f.name ?? '');
        return allRows.map((row) => {
            const obj: Record<string, unknown> = {};
            (row.f ?? []).forEach((cell, index) => {
                const key = fieldNames[index] || `col_${index}`;
                obj[key] = cell.v;
            });
            return obj;
        });
    }

    private toExclusiveEndDate(endDate: string): string {
        const [yearStr, monthStr, dayStr] = endDate.split('-');
        const nextDay = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1));
        return nextDay.toISOString().slice(0, 10);
    }

    private async buildImpersonatedAuth(serviceAccountEmail: string): Promise<Impersonated> {
        const credentialsJson = this.configService.get<string>('GCP_SA_CREDENTIALS_JSON');

        if (!credentialsJson) {
            throw new BadRequestException(
                'GCP_SA_CREDENTIALS_JSON não configurada. Defina a service account da plataforma para impersonação.'
            );
        }

        let credentials: Record<string, unknown>;
        try {
            const decoded = Buffer.from(credentialsJson, 'base64').toString('utf8');
            credentials = JSON.parse(decoded);
        } catch {
            try {
                credentials = JSON.parse(credentialsJson);
            } catch {
                throw new BadRequestException('GCP_SA_CREDENTIALS_JSON inválida: deve ser JSON ou base64 de JSON.');
            }
        }

        const platformAuth = new GoogleAuth({
            credentials: credentials as never,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });

        const sourceClient = await platformAuth.getClient();

        return new Impersonated({
            sourceClient: sourceClient as never,
            targetPrincipal: serviceAccountEmail,
            lifetime: 3600,
            delegates: [],
            targetScopes: [
                'https://www.googleapis.com/auth/cloud-platform',
                'https://www.googleapis.com/auth/bigquery',
            ],
        });
    }
}
