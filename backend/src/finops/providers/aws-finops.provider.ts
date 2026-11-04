import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { STSClient, AssumeRoleCommand, type AssumeRoleCommandInput } from '@aws-sdk/client-sts';
import {
    CostExplorerClient,
    GetCostAndUsageCommand,
    GetCostAndUsageWithResourcesCommand,
    type GetCostAndUsageCommandInput,
    type GetCostAndUsageWithResourcesCommandInput,
} from '@aws-sdk/client-cost-explorer';

import type { IFinopsProvider, FinopsCostCollectionResult, FinopsProviderCredentials } from './finops-provider.interface';
import { capResourceEntriesByDay } from './finops-provider.interface';

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
