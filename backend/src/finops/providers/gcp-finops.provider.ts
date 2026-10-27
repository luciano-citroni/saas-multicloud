import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { google, bigquery_v2 } from 'googleapis';

import type { IFinopsProvider, FinopsCostCollectionResult, FinopsCostEntry, FinopsProviderCredentials } from './finops-provider.interface';

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
