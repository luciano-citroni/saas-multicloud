import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { STSClient, AssumeRoleCommand, type AssumeRoleCommandInput } from '@aws-sdk/client-sts';
import {
    BillingClient,
    GetCreditsCommand,
    type CreditData,
} from '@aws-sdk/client-billing';
import {
    CostExplorerClient,
    GetCostAndUsageCommand,
    GetCostAndUsageWithResourcesCommand,
    GetCostForecastCommand,
    GetReservationUtilizationCommand,
    GetSavingsPlansCoverageCommand,
    GetSavingsPlansPurchaseRecommendationCommand,
    GetSavingsPlansUtilizationCommand,
    type ReservationAggregates,
    type SavingsPlansCoverage,
    type SavingsPlansUtilization,
    type GetCostAndUsageCommandInput,
    type GetCostAndUsageWithResourcesCommandInput,
    type GetCostForecastCommandOutput,
    type SavingsPlansPurchaseRecommendationSummary,
} from '@aws-sdk/client-cost-explorer';

import type {
    IFinopsProvider,
    FinopsCommitmentRecommendationEntry,
    FinopsCommitmentUtilizationEntry,
    FinopsCostCollectionResult,
    FinopsCreditConsumptionEntry,
    FinopsCreditGrantEntry,
    FinopsProviderCredentials,
    ProviderCostForecast,
    ProviderMonthForecast,
} from './finops-provider.interface';
import { readForecastCache, writeForecastCache } from './forecast-cache';
import { capResourceEntriesByDay, dedupeCostEntries } from './finops-provider.interface';
import { describeAwsUsageType } from './aws-usage-type';

@Injectable()
export class AwsFinopsProvider implements IFinopsProvider {
    readonly provider = 'aws';

    private readonly logger = new Logger(AwsFinopsProvider.name);

    constructor(private readonly configService: ConfigService) {}

    async collectCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY'
    ): Promise<FinopsCostCollectionResult> {
        const { credentials, cloudAccountId } = creds;
        const { roleArn, externalId } = credentials as {
            roleArn: string;
            externalId?: string;
        };

        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        this.logger.log(`[AWS FinOps] Coletando custos para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`);

        const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
        const exclusiveEndDate = this.toExclusiveEndDate(endDate);

        // AmortizedCost distribui RIs e Savings Plans proporcionalmente — mais preciso para FinOps
        // AWS Cost Explorer permite no máximo 2 GroupBy — usamos SERVICE + REGION
        // Sem NextPageToken a resposta trunca grupos (SERVICE×REGION×dias) e o total fica incompleto.
        const baseInput: GetCostAndUsageCommandInput = {
            TimePeriod: { Start: startDate, End: exclusiveEndDate },
            Granularity: granularity,
            Metrics: ['AmortizedCost', 'UsageQuantity'],
            GroupBy: [
                { Type: 'DIMENSION', Key: 'SERVICE' },
                { Type: 'DIMENSION', Key: 'REGION' },
            ],
        };

        const entries: FinopsCostCollectionResult['entries'] = [];
        const currency = 'USD';
        let nextPageToken: string | undefined;
        let pageCount = 0;

        try {
            do {
                pageCount += 1;
                const response = await awsClient.send(
                    new GetCostAndUsageCommand({
                        ...baseInput,
                        ...(nextPageToken ? { NextPageToken: nextPageToken } : {}),
                    }),
                );

                for (const result of response.ResultsByTime ?? []) {
                    const periodStart = result.TimePeriod?.Start ?? startDate;

                    for (const group of result.Groups ?? []) {
                        const [service, region] = group.Keys ?? ['Unknown', ''];
                        const amount = Number(group.Metrics?.['AmortizedCost']?.Amount ?? '0');
                        const usageQty = Number(group.Metrics?.['UsageQuantity']?.Amount ?? '0');
                        const unit = group.Metrics?.['UsageQuantity']?.Unit ?? '';

                        // Zero cost = irrelevante. Créditos (negativos) SÃO incluídos para precisão total.
                        if (amount === 0) continue;

                        if (amount < 0) {
                            this.logger.log(
                                `[AWS FinOps] Crédito detectado: service="${service}", region="${region}", valor=${amount} ${currency}`,
                            );
                        }

                        entries.push({
                            service: service ?? 'Unknown',
                            resourceId: '',
                            region: region || null,
                            usageType: '',
                            operation: '',
                            cost: amount,
                            currency,
                            usageQuantity: usageQty,
                            usageUnit: unit,
                            date: periodStart,
                        });
                    }
                }

                nextPageToken = response.NextPageToken;
            } while (nextPageToken);
        } catch (error) {
            throw this.mapAwsError(error, 'Cost Explorer', roleArn);
        }

        this.logger.log(
            `[AWS FinOps] ${entries.length} registros coletados para conta ${cloudAccountId} (${pageCount} página(s))`,
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
        const { roleArn, externalId } = credentials as {
            roleArn: string;
            externalId?: string;
        };

        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        this.logger.log(
            `[AWS FinOps] Coletando custos por recurso para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`,
        );

        const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
        const exclusiveEndDate = this.toExclusiveEndDate(endDate);

        const baseInput: GetCostAndUsageWithResourcesCommandInput = {
            TimePeriod: { Start: startDate, End: exclusiveEndDate },
            Granularity: granularity,
            Metrics: ['AmortizedCost', 'UsageQuantity'],
            Filter: {
                Dimensions: {
                    Key: 'SERVICE',
                    Values: [
                        'Amazon Elastic Compute Cloud - Compute',
                        'Amazon Relational Database Service',
                        'Amazon Elastic Block Store',
                        'Amazon Elastic Load Balancing',
                        'AWS Lambda',
                        'Amazon Elastic Container Service',
                        'Amazon Elastic Kubernetes Service',
                        'Amazon Simple Storage Service',
                        'Amazon DynamoDB',
                        'AmazonCloudWatch',
                        'Amazon Virtual Private Cloud',
                    ],
                },
            },
            GroupBy: [{ Type: 'DIMENSION', Key: 'RESOURCE_ID' }],
        };

        const entries: FinopsCostCollectionResult['entries'] = [];
        const currency = 'USD';
        let nextPageToken: string | undefined;
        let pageCount = 0;

        try {
            do {
                pageCount += 1;
                const response = await awsClient.send(
                    new GetCostAndUsageWithResourcesCommand({
                        ...baseInput,
                        ...(nextPageToken ? { NextPageToken: nextPageToken } : {}),
                    }),
                );

                for (const result of response.ResultsByTime ?? []) {
                    const periodStart = result.TimePeriod?.Start ?? startDate;

                    for (const group of result.Groups ?? []) {
                        const resourceId = (group.Keys?.[0] ?? '').trim();
                        if (!resourceId) continue;

                        const amount = Number(group.Metrics?.['AmortizedCost']?.Amount ?? '0');
                        const usageQty = Number(group.Metrics?.['UsageQuantity']?.Amount ?? '0');
                        const unit = group.Metrics?.['UsageQuantity']?.Unit ?? '';
                        if (amount === 0) continue;

                        // Infer service/region from resource id when possible for drill-down filters
                        const service = this.inferServiceFromResourceId(resourceId);
                        const region = this.inferRegionFromResourceId(resourceId);

                        entries.push({
                            service,
                            resourceId,
                            region,
                            usageType: '',
                            operation: '',
                            cost: amount,
                            currency,
                            usageQuantity: usageQty,
                            usageUnit: unit,
                            date: periodStart,
                        });
                    }
                }

                nextPageToken = response.NextPageToken;
            } while (nextPageToken);
        } catch (error) {
            // Contas sem permissão / dados de recurso: não quebra o sync de serviço.
            this.logger.warn(
                `[AWS FinOps] collectResourceCosts falhou (continuando sem recursos): ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return { entries: [], currency: 'USD' };
        }

        const capped = capResourceEntriesByDay(entries);
        this.logger.log(
            `[AWS FinOps] ${capped.length} registros por recurso coletados para conta ${cloudAccountId} (raw=${entries.length}, ${pageCount} página(s))`,
        );

        return { entries: capped, currency };
    }

    /**
     * Mês fechado por usage type. RESOURCE_ID no Cost Explorer só existe nos últimos
     * 14 dias; o fechamento do relatório usa o mês inteiro.
     */
    async collectUsageTypeCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
    ): Promise<FinopsCostCollectionResult> {
        const { credentials, cloudAccountId } = creds;
        const { roleArn, externalId } = credentials as { roleArn: string; externalId?: string };
        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
        const exclusiveEndDate = this.toExclusiveEndDate(endDate);
        const baseInput: GetCostAndUsageCommandInput = {
            TimePeriod: { Start: startDate, End: exclusiveEndDate },
            Granularity: 'MONTHLY',
            Metrics: ['AmortizedCost'],
            GroupBy: [
                { Type: 'DIMENSION', Key: 'USAGE_TYPE' },
                { Type: 'DIMENSION', Key: 'SERVICE' },
            ],
        };

        const entries: FinopsCostCollectionResult['entries'] = [];
        let nextPageToken: string | undefined;

        do {
            const response = await awsClient.send(
                new GetCostAndUsageCommand({
                    ...baseInput,
                    ...(nextPageToken ? { NextPageToken: nextPageToken } : {}),
                }),
            );
            for (const result of response.ResultsByTime ?? []) {
                const periodStart = result.TimePeriod?.Start ?? startDate;
                for (const group of result.Groups ?? []) {
                    const [usageType, service] = group.Keys ?? ['', 'Unknown'];
                    const amount = Number(group.Metrics?.['AmortizedCost']?.Amount ?? '0');
                    const described = describeAwsUsageType(usageType ?? '');
                    if (!described.resourceId || amount === 0) continue;
                    entries.push({
                        service: service ?? 'Unknown',
                        resourceId: described.resourceId,
                        region: described.region || null,
                        usageType: usageType ?? '',
                        operation: '',
                        cost: amount,
                        currency: 'USD',
                        usageQuantity: 0,
                        usageUnit: '',
                        date: periodStart,
                    });
                }
            }
            nextPageToken = response.NextPageToken;
        } while (nextPageToken);

        const deduped = dedupeCostEntries(entries);
        this.logger.log(`[AWS FinOps] ${deduped.length} usage types para conta ${cloudAccountId} (${startDate} → ${endDate})`);
        return { entries: deduped, currency: 'USD' };
    }

    async collectCreditConsumption(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
    ): Promise<FinopsCreditConsumptionEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const { roleArn, externalId } = credentials as { roleArn: string; externalId?: string };
        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        this.logger.log(
            `[AWS FinOps] Coletando consumo de créditos para conta ${cloudAccountId} (${startDate} → ${endDate})`,
        );

        try {
            const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
            const exclusiveEndDate = this.toExclusiveEndDate(endDate);
            const baseInput: GetCostAndUsageCommandInput = {
                TimePeriod: { Start: startDate, End: exclusiveEndDate },
                Granularity: 'DAILY',
                Metrics: ['UnblendedCost'],
                Filter: {
                    Dimensions: {
                        Key: 'RECORD_TYPE',
                        Values: ['Credit', 'Refund'],
                    },
                },
                GroupBy: [{ Type: 'DIMENSION', Key: 'RECORD_TYPE' }],
            };

            const entries: FinopsCreditConsumptionEntry[] = [];
            let nextPageToken: string | undefined;

            do {
                const response = await awsClient.send(
                    new GetCostAndUsageCommand({
                        ...baseInput,
                        ...(nextPageToken ? { NextPageToken: nextPageToken } : {}),
                    }),
                );

                for (const result of response.ResultsByTime ?? []) {
                    const periodStart = result.TimePeriod?.Start ?? startDate;
                    for (const group of result.Groups ?? []) {
                        const label = group.Keys?.[0] ?? 'Credit';
                        const rawAmount = Number(group.Metrics?.['UnblendedCost']?.Amount ?? '0');
                        if (rawAmount === 0) continue;
                        // CE returns credits as negative; store as positive consumption.
                        entries.push({
                            date: periodStart,
                            amount: Math.abs(rawAmount),
                            currency: group.Metrics?.['UnblendedCost']?.Unit ?? 'USD',
                            label,
                            rawMetadata: { recordType: label, rawAmount },
                        });
                    }
                }

                nextPageToken = response.NextPageToken;
            } while (nextPageToken);

            this.logger.log(`[AWS FinOps] ${entries.length} entradas de crédito coletadas para ${cloudAccountId}`);
            return entries;
        } catch (error) {
            this.logger.warn(
                `[AWS FinOps] collectCreditConsumption falhou: ${error instanceof Error ? error.message : String(error)}`,
            );
            return [];
        }
    }

    async collectCreditGrants(creds: FinopsProviderCredentials): Promise<FinopsCreditGrantEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const { roleArn, externalId } = credentials as { roleArn: string; externalId?: string };
        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        const accountId = accountIdFromRoleArn(roleArn);
        if (!accountId) {
            this.logger.warn(`[AWS FinOps] Não foi possível extrair o account id de ${roleArn}`);
            return [];
        }

        this.logger.log(`[AWS FinOps] Coletando concessões de crédito (Billing) para ${cloudAccountId}`);

        try {
            const client = await this.buildBillingClient(roleArn, externalId);
            const startDate = new Date(Date.now() - 364 * 24 * 60 * 60 * 1000);
            const credits = await this.fetchCredits(client, accountId, startDate);
            const grants: FinopsCreditGrantEntry[] = [];

            for (const credit of credits) {
                const mapped = mapAwsCredit(credit);
                if (mapped) grants.push(mapped);
            }

            this.logger.log(`[AWS FinOps] ${grants.length} concessões de crédito importadas para ${cloudAccountId}`);
            return grants;
        } catch (error) {
            this.logger.warn(
                `[AWS FinOps] collectCreditGrants falhou (a role precisa de billing:GetCredits e aws-portal:ViewBilling): ${
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
        const { roleArn, externalId } = credentials as { roleArn: string; externalId?: string };
        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        const { startDate, endDate } = this.lookbackRange(lookbackDays);
        this.logger.log(
            `[AWS FinOps] Coletando utilização de Savings Plans para ${cloudAccountId} (${startDate} → ${endDate})`,
        );

        const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
        const exclusiveEnd = this.toExclusiveEndDate(endDate);
        const timePeriod = { Start: startDate, End: exclusiveEnd };
        const entries: FinopsCommitmentUtilizationEntry[] = [];

        let utilization: SavingsPlansUtilization | null = null;
        try {
            const response = await awsClient.send(
                new GetSavingsPlansUtilizationCommand({
                    TimePeriod: timePeriod,
                    // DAILY aceita qualquer início. MONTHLY exige o dia 1 do mês e falha no lookback atual.
                    Granularity: 'DAILY',
                }),
            );
            utilization = response.Total?.Utilization ?? this.sumSavingsPlanUtilization(response.SavingsPlansUtilizationsByTime);
        } catch (error) {
            this.logger.warn(`[AWS FinOps] GetSavingsPlansUtilization indisponível: ${this.awsErrorDetail(error)}`);
        }

        let coveragePct: number | null = null;
        try {
            const coverage = await awsClient.send(
                new GetSavingsPlansCoverageCommand({
                    TimePeriod: timePeriod,
                    Granularity: 'DAILY',
                    Metrics: ['SpendCoveredBySavingsPlans'],
                }),
            );
            coveragePct = this.averageSavingsPlanCoverage(coverage.SavingsPlansCoverages ?? []);
        } catch (error) {
            this.logger.warn(`[AWS FinOps] GetSavingsPlansCoverage falhou: ${this.awsErrorDetail(error)}`);
        }

        const utilPct = this.parseAwsAmount(utilization?.UtilizationPercentage);
        const used = this.parseAwsAmount(utilization?.UsedCommitment);
        const unused = this.parseAwsAmount(utilization?.UnusedCommitment);
        const totalCommitment = this.parseAwsAmount(utilization?.TotalCommitment);

        if (utilPct != null || coveragePct != null || used != null || unused != null || totalCommitment != null) {
            entries.push({
                commitmentType: 'savings_plan',
                externalId: `sp-aggregate-${cloudAccountId}`,
                name: 'Savings Plans (aggregate)',
                utilizationPercent: utilPct,
                coveragePercent: coveragePct,
                usedCommitment: used,
                unusedCommitment: unused,
                hourlyCommitment: totalCommitment != null ? totalCommitment / (lookbackDays * 24) : null,
                monthlyCommitment: totalCommitment,
                term: null,
                currency: 'USD',
                lookbackDays,
                rawMetadata: { utilization, coveragePercent: coveragePct, startDate, endDate },
            });
        }

        try {
            const reservation = await awsClient.send(
                new GetReservationUtilizationCommand({
                    TimePeriod: timePeriod,
                    Granularity: 'DAILY',
                }),
            );
            const reservationEntry = this.mapReservationUtilization(reservation.Total, cloudAccountId, lookbackDays, startDate, endDate);
            if (reservationEntry) entries.push(reservationEntry);
        } catch (error) {
            this.logger.warn(`[AWS FinOps] GetReservationUtilization indisponível: ${this.awsErrorDetail(error)}`);
        }

        this.logger.log(`[AWS FinOps] ${entries.length} snapshot(s) de compromisso para ${cloudAccountId}`);
        return entries;
    }

    async collectCommitmentRecommendations(
        creds: FinopsProviderCredentials,
        lookbackDays: number,
    ): Promise<FinopsCommitmentRecommendationEntry[]> {
        const { credentials, cloudAccountId } = creds;
        const { roleArn, externalId } = credentials as { roleArn: string; externalId?: string };
        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }

        this.logger.log(`[AWS FinOps] Coletando recomendações de Savings Plans para ${cloudAccountId}`);

        const lookbackOption =
            lookbackDays >= 60 ? 'SIXTY_DAYS' : lookbackDays >= 30 ? 'THIRTY_DAYS' : 'SEVEN_DAYS';

        const configs: Array<{ term: 'ONE_YEAR' | 'THREE_YEARS'; payment: 'NO_UPFRONT' | 'PARTIAL_UPFRONT' | 'ALL_UPFRONT' }> =
            [
                { term: 'ONE_YEAR', payment: 'NO_UPFRONT' },
                { term: 'ONE_YEAR', payment: 'PARTIAL_UPFRONT' },
                { term: 'THREE_YEARS', payment: 'NO_UPFRONT' },
            ];

        try {
            const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
            const entries: FinopsCommitmentRecommendationEntry[] = [];
            let lastError = '';

            for (const cfg of configs) {
                try {
                    const summary = await this.fetchSavingsPlanRecommendation(awsClient, {
                        term: cfg.term,
                        payment: cfg.payment,
                        lookback: lookbackOption,
                    });
                    const hourly = summary?.HourlyCommitmentToPurchase
                        ? Number(summary.HourlyCommitmentToPurchase)
                        : null;
                    const monthlySavings = summary?.EstimatedMonthlySavingsAmount
                        ? Number(summary.EstimatedMonthlySavingsAmount)
                        : null;
                    const savingsPct = summary?.EstimatedSavingsPercentage
                        ? Number(summary.EstimatedSavingsPercentage)
                        : null;

                    const eligible = (hourly ?? 0) > 0 && (monthlySavings ?? 0) > 0;
                    const key = `compute_sp:${cfg.term}:${cfg.payment}:${lookbackOption}`;

                    entries.push({
                        commitmentType: 'savings_plan',
                        recommendationKey: key,
                        lookbackDays,
                        term: cfg.term,
                        paymentOption: cfg.payment,
                        estimatedMonthlySavings: monthlySavings,
                        estimatedSavingsPercentage: savingsPct,
                        recommendedHourlyCommitment: hourly,
                        eligible,
                        ineligibleReason: eligible
                            ? null
                            : 'Sem compromisso elegível adicional para este lookback/termo — cobertura já alta ou uso fora do escopo de Savings Plans.',
                        summary: eligible
                            ? `Compute SP ${cfg.term} / ${cfg.payment}: ~$${monthlySavings?.toFixed(2) ?? '0'}/mês`
                            : 'Nenhuma compra adicional recomendada',
                        currency: 'USD',
                        rawMetadata: { summary: summary ?? null },
                    });
                } catch (inner) {
                    lastError = this.awsErrorDetail(inner);
                    this.logger.warn(
                        `[AWS FinOps] SP recommendation ${cfg.term}/${cfg.payment} falhou: ${lastError}`,
                    );
                }
            }

            if (entries.length === 0) {
                entries.push({
                    commitmentType: 'savings_plan',
                    recommendationKey: `compute_sp:none:${lookbackOption}`,
                    lookbackDays,
                    term: null,
                    paymentOption: null,
                    estimatedMonthlySavings: null,
                    estimatedSavingsPercentage: null,
                    recommendedHourlyCommitment: null,
                    eligible: false,
                    ineligibleReason: lastError
                        ? `Cost Explorer recusou a recomendação de Savings Plans: ${lastError}`
                        : 'Cost Explorer não retornou recomendações de Savings Plans.',
                    summary: 'Sem recomendações disponíveis',
                    currency: 'USD',
                });
            }

            return entries;
        } catch (error) {
            this.logger.warn(
                `[AWS FinOps] collectCommitmentRecommendations falhou: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [];
        }
    }

    /**
     * Conta payer aceita AccountScope=PAYER. Conta vinculada só aceita LINKED.
     */
    private async fetchSavingsPlanRecommendation(
        client: CostExplorerClient,
        input: {
            term: 'ONE_YEAR' | 'THREE_YEARS';
            payment: 'NO_UPFRONT' | 'PARTIAL_UPFRONT' | 'ALL_UPFRONT';
            lookback: 'SEVEN_DAYS' | 'THIRTY_DAYS' | 'SIXTY_DAYS';
        },
    ): Promise<SavingsPlansPurchaseRecommendationSummary | undefined> {
        const send = (accountScope: 'PAYER' | 'LINKED') =>
            client.send(
                new GetSavingsPlansPurchaseRecommendationCommand({
                    SavingsPlansType: 'COMPUTE_SP',
                    TermInYears: input.term,
                    PaymentOption: input.payment,
                    LookbackPeriodInDays: input.lookback,
                    AccountScope: accountScope,
                }),
            );

        try {
            const response = await send('PAYER');
            return response.SavingsPlansPurchaseRecommendation?.SavingsPlansPurchaseRecommendationSummary;
        } catch (error) {
            const detail = this.awsErrorDetail(error);
            if (!/can only be LINKED/i.test(detail)) throw error;
            this.logger.log(
                `[AWS FinOps] Conta vinculada — repetindo recomendação SP ${input.term}/${input.payment} com AccountScope=LINKED`,
            );
            const response = await send('LINKED');
            return response.SavingsPlansPurchaseRecommendation?.SavingsPlansPurchaseRecommendationSummary;
        }
    }

    private awsErrorDetail(error: unknown): string {
        const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: string }).name ?? '') : '';
        const message = error instanceof Error ? error.message : String(error);
        if (!message || message === 'UnknownError') return name || message || 'erro desconhecido';
        return name && !message.includes(name) ? `${name}: ${message}` : message;
    }

    private parseAwsAmount(value: string | number | null | undefined): number | null {
        if (value == null || value === '') return null;
        const amount = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(amount) ? amount : null;
    }

    private sumSavingsPlanUtilization(
        points: Array<{ Utilization?: SavingsPlansUtilization }> | undefined,
    ): SavingsPlansUtilization | null {
        let used = 0;
        let unused = 0;
        let total = 0;
        let seen = false;
        for (const point of points ?? []) {
            const row = point.Utilization;
            const rowTotal = this.parseAwsAmount(row?.TotalCommitment);
            const rowUsed = this.parseAwsAmount(row?.UsedCommitment);
            const rowUnused = this.parseAwsAmount(row?.UnusedCommitment);
            if (rowTotal == null && rowUsed == null && rowUnused == null) continue;
            seen = true;
            total += rowTotal ?? 0;
            used += rowUsed ?? 0;
            unused += rowUnused ?? 0;
        }
        if (!seen || total <= 0) return null;
        return {
            TotalCommitment: String(total),
            UsedCommitment: String(used),
            UnusedCommitment: String(unused),
            UtilizationPercentage: String((used / total) * 100),
        };
    }

    private averageSavingsPlanCoverage(points: SavingsPlansCoverage[]): number | null {
        let weighted = 0;
        let weight = 0;
        const plain: number[] = [];
        for (const point of points) {
            const percent = this.parseAwsAmount(point.Coverage?.CoveragePercentage);
            if (percent == null) continue;
            const cost = this.parseAwsAmount(point.Coverage?.TotalCost);
            if (cost != null && cost > 0) {
                weighted += percent * cost;
                weight += cost;
            } else {
                plain.push(percent);
            }
        }
        if (weight > 0) return weighted / weight;
        if (plain.length === 0) return null;
        return plain.reduce((sum, value) => sum + value, 0) / plain.length;
    }

    private mapReservationUtilization(
        total: ReservationAggregates | undefined,
        cloudAccountId: string,
        lookbackDays: number,
        startDate: string,
        endDate: string,
    ): FinopsCommitmentUtilizationEntry | null {
        const utilizationPercent = this.parseAwsAmount(total?.UtilizationPercentage);
        const unusedCommitment = this.parseAwsAmount(total?.RICostForUnusedHours);
        const usedCommitment = this.parseAwsAmount(total?.TotalAmortizedFee);
        if (utilizationPercent == null && unusedCommitment == null && usedCommitment == null) return null;
        return {
            commitmentType: 'reservation',
            externalId: `ri-aggregate-${cloudAccountId}`,
            name: 'Reserved Instances (aggregate)',
            utilizationPercent,
            coveragePercent: null,
            usedCommitment,
            unusedCommitment,
            hourlyCommitment: null,
            monthlyCommitment: usedCommitment,
            term: null,
            currency: 'USD',
            lookbackDays,
            rawMetadata: { total: total ?? null, startDate, endDate },
        };
    }

    private lookbackRange(lookbackDays: number): { startDate: string; endDate: string } {
        const end = new Date();
        end.setUTCHours(0, 0, 0, 0);
        // Cost Explorer exclusive end = today; inclusive end = yesterday
        const inclusiveEnd = new Date(end);
        inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
        const start = new Date(inclusiveEnd);
        start.setUTCDate(start.getUTCDate() - (lookbackDays - 1));
        return {
            startDate: start.toISOString().slice(0, 10),
            endDate: inclusiveEnd.toISOString().slice(0, 10),
        };
    }

    private inferServiceFromResourceId(resourceId: string): string {
        const id = resourceId.toLowerCase();
        if (id.includes(':instance/') || id.startsWith('i-')) return 'Amazon Elastic Compute Cloud - Compute';
        if (id.includes(':db:') || id.includes('rds')) return 'Amazon Relational Database Service';
        if (id.includes(':volume/') || id.startsWith('vol-')) return 'Amazon Elastic Block Store';
        if (id.includes('loadbalancer') || id.includes(':listener/')) return 'Amazon Elastic Load Balancing';
        if (id.includes(':function:')) return 'AWS Lambda';
        if (id.includes('s3') || (!id.includes(':') && !id.startsWith('i-'))) {
            // bare bucket names often appear as resource id
            if (!id.startsWith('i-') && !id.startsWith('vol-') && !id.includes(':')) {
                return 'Amazon Simple Storage Service';
            }
        }
        return 'AWS Resource';
    }

    /** Extrai região de ARNs (`arn:aws:ec2:us-east-2:123:instance/i-…`). */
    private inferRegionFromResourceId(resourceId: string): string | null {
        const arnMatch = resourceId.match(/^arn:aws(?:-cn|-us-gov)?:[^:]+:([a-z0-9-]+):/i);
        if (arnMatch?.[1] && arnMatch[1] !== '') {
            return arnMatch[1];
        }
        return null;
    }

    private toExclusiveEndDate(endDate: string): string {
        const [yearStr, monthStr, dayStr] = endDate.split('-');
        const nextDay = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1));
        return nextDay.toISOString().slice(0, 10);
    }

    private async buildBillingClient(roleArn: string, externalId?: string): Promise<BillingClient> {
        const temporary = await this.assumeRole(roleArn, externalId);
        return new BillingClient({
            region: 'us-east-1',
            credentials: temporary,
        });
    }

    private async fetchCredits(client: BillingClient, accountId: string, startDate: Date): Promise<CreditData[]> {
        const merged = new Map<string, CreditData>();
        const absorb = (credits: CreditData[] | undefined) => {
            for (const credit of credits ?? []) {
                const id = credit.creditId?.trim();
                if (!id) continue;
                const current = merged.get(id);
                if (!current || creditBalance(credit) > creditBalance(current)) merged.set(id, credit);
            }
        };

        try {
            const own = await client.send(
                new GetCreditsCommand({
                    accountId,
                    startDate,
                    payerAccountFlag: false,
                }),
            );
            absorb(own.credits);
        } catch (error) {
            this.logger.warn(
                `[AWS FinOps] GetCredits da conta falhou: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        try {
            const family = await client.send(
                new GetCreditsCommand({
                    accountId,
                    startDate,
                    payerAccountFlag: true,
                }),
            );
            absorb(family.credits);
        } catch (error) {
            this.logger.warn(
                `[AWS FinOps] GetCredits com payerAccountFlag falhou: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        return [...merged.values()];
    }

    /**
     * Fim do mês no mesmo número do console (Forecasted month-end):
     * Unblended realizado de hoje inclusive + forecast de amanhã até o dia 1 do mês seguinte.
     * O resto do mês usa DAILY: MONTHLY só aceita o dia 1, e esse dia já passou.
     */
    async forecastMonthEnd(creds: FinopsProviderCredentials): Promise<ProviderCostForecast> {
        const today = utcDay();
        const cacheKey = `${creds.cloudAccountId}:${today}:month-end`;
        const cached = readForecastCache<ProviderCostForecast>(cacheKey);
        if (cached) return cached;

        const forecast = await this.loadMonthEndForecast(creds, today);
        writeForecastCache(cacheKey, forecast);
        return forecast;
    }

    /**
     * Próximos meses fechados. O início é o dia 1, então a granularidade MONTHLY vale.
     */
    async forecastUpcomingMonths(creds: FinopsProviderCredentials, months = 3): Promise<ProviderMonthForecast[]> {
        const count = Math.min(Math.max(Math.trunc(months) || 3, 1), 12);
        const today = utcDay();
        const cacheKey = `${creds.cloudAccountId}:${today}:next:${count}`;
        const cached = readForecastCache<ProviderMonthForecast[]>(cacheKey);
        if (cached) return cached;

        const forecast = await this.loadUpcomingForecast(creds, today, count);
        writeForecastCache(cacheKey, forecast);
        return forecast;
    }

    private async loadMonthEndForecast(creds: FinopsProviderCredentials, today: string): Promise<ProviderCostForecast> {
        const client = await this.costExplorerFor(creds);
        const monthStart = `${today.slice(0, 7)}-01`;
        const tomorrow = addUtcDays(today, 1);
        const nextMonth = firstOfNextMonth(today);

        const actualResponse = await client.send(
            new GetCostAndUsageCommand({
                TimePeriod: { Start: monthStart, End: tomorrow },
                Granularity: 'MONTHLY',
                Metrics: ['UnblendedCost'],
            }),
        );
        const actual = sumUnblended(actualResponse);

        let forecastAmount = 0;
        let forecastCurrency = actual.currency;
        if (tomorrow < nextMonth) {
            const forecastResponse = await client.send(
                new GetCostForecastCommand({
                    TimePeriod: { Start: tomorrow, End: nextMonth },
                    Metric: 'UNBLENDED_COST',
                    Granularity: 'DAILY',
                }),
            );
            const forecast = readForecastTotal(forecastResponse);
            forecastAmount = forecast.amount;
            forecastCurrency = forecast.currency;
        }

        const amount = roundMoney(actual.amount + forecastAmount);
        if (!Number.isFinite(amount)) {
            throw new BadRequestException('Cost Explorer devolveu um forecast inválido.');
        }

        return {
            amount,
            currency: (actual.amount !== 0 ? actual.currency : forecastCurrency).toUpperCase(),
        };
    }

    private async loadUpcomingForecast(
        creds: FinopsProviderCredentials,
        today: string,
        months: number,
    ): Promise<ProviderMonthForecast[]> {
        const client = await this.costExplorerFor(creds);
        const start = firstOfNextMonth(today);
        const end = firstOfMonthOffset(start, months);
        const response = await client.send(
            new GetCostForecastCommand({
                TimePeriod: { Start: start, End: end },
                Metric: 'UNBLENDED_COST',
                Granularity: 'MONTHLY',
            }),
        );
        const currency = (response.Total?.Unit ?? 'USD').toUpperCase();
        const rows = (response.ForecastResultsByTime ?? [])
            .map((row) => ({
                month: (row.TimePeriod?.Start ?? '').slice(0, 7),
                amount: roundMoney(Number(row.MeanValue ?? 0)),
                currency,
            }))
            .filter((row) => /^\d{4}-\d{2}$/.test(row.month));

        if (rows.length === 0) {
            throw new BadRequestException('Cost Explorer não devolveu previsão para os próximos meses.');
        }
        return rows;
    }

    private async costExplorerFor(creds: FinopsProviderCredentials): Promise<CostExplorerClient> {
        const { roleArn, externalId } = creds.credentials as { roleArn?: string; externalId?: string };
        if (!roleArn) {
            throw new BadRequestException('Credencial AWS inválida: roleArn ausente.');
        }
        return this.buildCostExplorerClient(roleArn, externalId);
    }

    private async buildCostExplorerClient(roleArn: string, externalId?: string): Promise<CostExplorerClient> {
        const temporary = await this.assumeRole(roleArn, externalId);

        // Cost Explorer disponível apenas em us-east-1
        return new CostExplorerClient({
            region: 'us-east-1',
            credentials: temporary,
        });
    }

    private async assumeRole(
        roleArn: string,
        externalId?: string
    ): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }> {
        const sts = this.buildPlatformStsClient();

        const assumeInput: AssumeRoleCommandInput = {
            RoleArn: roleArn,
            RoleSessionName: 'FinopsSession',
            DurationSeconds: 3600,
            ...(externalId ? { ExternalId: externalId } : {}),
        };

        try {
            const assumed = await sts.send(new AssumeRoleCommand(assumeInput));
            const awsCreds = assumed.Credentials;

            if (!awsCreds?.AccessKeyId || !awsCreds.SecretAccessKey || !awsCreds.SessionToken) {
                throw new Error(`STS retornou credenciais incompletas para ${roleArn}`);
            }

            return {
                accessKeyId: awsCreds.AccessKeyId,
                secretAccessKey: awsCreds.SecretAccessKey,
                sessionToken: awsCreds.SessionToken,
            };
        } catch (error) {
            throw this.mapAwsError(error, 'STS AssumeRole', roleArn);
        }
    }

    /**
     * Credenciais da plataforma (IAM user) para AssumeRole.
     * Access keys de longo prazo (AKIA*) não devem carregar AWS_SESSION_TOKEN stale —
     * isso gera "The security token included in the request is invalid".
     */
    private buildPlatformStsClient(): STSClient {
        const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
        const secretAccessKey =
            this.configService.get<string>('AWS_SECRET_ACCESS_KEY')?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim();
        const sessionToken =
            this.configService.get<string>('AWS_SESSION_TOKEN')?.trim() || process.env.AWS_SESSION_TOKEN?.trim();
        const stsRegion =
            this.configService.get<string>('AWS_STS_REGION')?.trim() || process.env.AWS_STS_REGION?.trim() || 'us-east-1';

        if (!accessKeyId || !secretAccessKey) {
            throw new BadRequestException(
                'Credenciais AWS da plataforma não configuradas. Defina AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY.'
            );
        }

        const isTemporaryKey = accessKeyId.startsWith('ASIA');
        const credentials = {
            accessKeyId,
            secretAccessKey,
            ...(isTemporaryKey && sessionToken ? { sessionToken } : {}),
        };

        if (!isTemporaryKey && sessionToken) {
            this.logger.warn(
                '[AWS FinOps] AWS_SESSION_TOKEN presente com access key de longo prazo (AKIA*). Ignorando session token para evitar InvalidClientTokenId.'
            );
        }

        return new STSClient({ region: stsRegion, credentials });
    }

    private mapAwsError(error: unknown, stage: string, roleArn: string): Error {
        const message = error instanceof Error ? error.message : String(error);
        const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: string }).name) : '';

        this.logger.error(`[AWS FinOps] Falha em ${stage}: ${name || 'Error'} — ${message}`);

        if (/security token|InvalidClientTokenId|UnrecognizedClientException/i.test(`${name} ${message}`)) {
            return new BadRequestException(
                `Credenciais AWS da plataforma inválidas ou expiradas (${stage}). ` +
                    'Verifique AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY no backend. ' +
                    'Se AWS_SESSION_TOKEN estiver definido com uma key AKIA*, remova o session token. ' +
                    `Detalhe: ${message}`
            );
        }

        if (/AccessDenied|not authorized|UnauthorizedOperation/i.test(`${name} ${message}`)) {
            return new BadRequestException(
                `Permissão insuficiente na role "${roleArn}" para ${stage}. ` +
                    'A role precisa permitir sts:AssumeRole (trust) e ce:GetCostAndUsage no Cost Explorer. ' +
                    `Detalhe: ${message}`
            );
        }

        return new BadRequestException(
            `Falha AWS FinOps em ${stage} para role "${roleArn}". Detalhe: ${message}`
        );
    }
}

function utcDay(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function firstOfNextMonth(iso: string): string {
    const [year, month] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function firstOfMonthOffset(monthStart: string, offset: number): string {
    const [year, month] = monthStart.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

function sumUnblended(response: { ResultsByTime?: Array<{ Total?: { UnblendedCost?: { Amount?: string; Unit?: string } } }> }): {
    amount: number;
    currency: string;
} {
    let amount = 0;
    let currency = 'USD';
    for (const result of response.ResultsByTime ?? []) {
        const metric = result.Total?.UnblendedCost;
        amount += Number(metric?.Amount ?? 0);
        if (metric?.Unit) currency = metric.Unit;
    }
    return { amount, currency: currency.toUpperCase() };
}

function readForecastTotal(response: GetCostForecastCommandOutput): { amount: number; currency: string } {
    const raw = response.Total?.Amount;
    const currency = (response.Total?.Unit ?? 'USD').toUpperCase();
    if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
        return { amount: Number(raw), currency };
    }
    const amount = (response.ForecastResultsByTime ?? []).reduce((sum, row) => sum + Number(row.MeanValue ?? 0), 0);
    return { amount, currency };
}

function accountIdFromRoleArn(roleArn: string): string | null {
    const match = roleArn.match(/:iam::(\d{12}):role\//);
    return match?.[1] ?? null;
}

function mapAwsCredit(credit: CreditData): FinopsCreditGrantEntry | null {
    const externalId = credit.creditId?.trim();
    const startsAt = toIsoDate(credit.startDate);
    const initial = parseAmount(credit.initialAmount);
    if (!externalId || !startsAt || !initial || initial.value <= 0) return null;

    const estimated = parseAmount(credit.estimatedAmount);
    const remaining = parseAmount(credit.remainingAmount);
    // A coluna de saldo da página de créditos da AWS é remainingAmount.
    // estimatedAmount 0 (sem conta em aberto) não pode zerar esse saldo.
    const reportedRemaining = remaining
        ? remaining.value
        : estimated && estimated.value > 0
          ? estimated.value
          : initial.value;
    const services = (credit.applicableProductNames ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 200);
    const notes = [credit.creditType, credit.creditStatus === 'DISABLED' ? 'DISABLED' : null]
        .filter(Boolean)
        .join(' · ');

    return {
        externalId: externalId.slice(0, 128),
        name: (credit.description?.trim() || externalId).slice(0, 255),
        totalAmount: initial.value,
        reportedRemaining: Math.min(initial.value, roundMoney(reportedRemaining)),
        currency: initial.currency,
        startsAt,
        expiresAt: toIsoDate(credit.endDate),
        services,
        appliesToAllServices: services.length === 0,
        notes: notes || null,
        usageByService: [],
    };
}

function creditBalance(credit: CreditData): number {
    const remaining = parseAmount(credit.remainingAmount);
    if (remaining) return remaining.value;
    const estimated = parseAmount(credit.estimatedAmount);
    if (estimated && estimated.value > 0) return estimated.value;
    return 0;
}

function parseAmount(amount: { currencyAmount?: string; currencyCode?: string } | undefined): { value: number; currency: string } | null {
    if (!amount?.currencyAmount) return null;
    const value = Number(amount.currencyAmount);
    if (!Number.isFinite(value)) return null;
    return { value: roundMoney(Math.abs(value)), currency: (amount.currencyCode || 'USD').toUpperCase() };
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function toIsoDate(value: Date | undefined): string | null {
    if (!value || Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
}
