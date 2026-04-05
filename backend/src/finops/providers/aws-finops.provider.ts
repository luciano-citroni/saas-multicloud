import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { STSClient, AssumeRoleCommand, type AssumeRoleCommandInput } from '@aws-sdk/client-sts';
import {
    CostExplorerClient,
    GetCostAndUsageCommand,
    type GetCostAndUsageCommandInput,
} from '@aws-sdk/client-cost-explorer';

import type { IFinopsProvider, FinopsCostCollectionResult, FinopsProviderCredentials } from './finops-provider.interface';

@Injectable()
export class AwsFinopsProvider implements IFinopsProvider {
    readonly provider = 'aws';

    private readonly logger = new Logger(AwsFinopsProvider.name);

    constructor(private readonly configService: ConfigService) {}

    async collectCosts(
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

        this.logger.log(`[AWS FinOps] Coletando custos para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`);

        const awsClient = await this.buildCostExplorerClient(roleArn, externalId);
        const exclusiveEndDate = this.toExclusiveEndDate(endDate);

        // AmortizedCost distribui RIs e Savings Plans proporcionalmente — mais preciso para FinOps
        // AWS Cost Explorer permite no máximo 2 GroupBy — usamos SERVICE + REGION
        const input: GetCostAndUsageCommandInput = {
            TimePeriod: { Start: startDate, End: exclusiveEndDate },
            Granularity: granularity,
            Metrics: ['AmortizedCost', 'UsageQuantity'],
            GroupBy: [
                { Type: 'DIMENSION', Key: 'SERVICE' },
                { Type: 'DIMENSION', Key: 'REGION' },
            ],
        };

        const response = await awsClient.send(new GetCostAndUsageCommand(input));

        const entries: FinopsCostCollectionResult['entries'] = [];
        const currency = 'USD';

        for (const result of response.ResultsByTime ?? []) {
            const periodStart = result.TimePeriod?.Start ?? startDate;

            for (const group of result.Groups ?? []) {
                const [service, region] = group.Keys ?? ['Unknown', ''];
                const usageType = '';
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
                    usageType: usageType ?? '',
                    operation: '',
                    cost: amount,
                    currency,
                    usageQuantity: usageQty,
                    usageUnit: unit,
                    date: periodStart,
                });
            }
        }

        this.logger.log(`[AWS FinOps] ${entries.length} registros coletados para conta ${cloudAccountId}`);

        return { entries, currency };
    }

    private toExclusiveEndDate(endDate: string): string {
        const [yearStr, monthStr, dayStr] = endDate.split('-');
        const nextDay = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1));
        return nextDay.toISOString().slice(0, 10);
    }

    private async buildCostExplorerClient(roleArn: string, externalId?: string): Promise<CostExplorerClient> {
        const stsRegion = this.configService.get<string>('AWS_STS_REGION', 'us-east-1');
        const sts = new STSClient({ region: stsRegion });

        const assumeInput: AssumeRoleCommandInput = {
            RoleArn: roleArn,
            RoleSessionName: 'FinopsSession',
            DurationSeconds: 3600,
            ...(externalId ? { ExternalId: externalId } : {}),
        };

        const assumed = await sts.send(new AssumeRoleCommand(assumeInput));
        const awsCreds = assumed.Credentials;

        if (!awsCreds?.AccessKeyId || !awsCreds.SecretAccessKey || !awsCreds.SessionToken) {
            throw new Error(`[AWS FinOps] Falha ao assumir role ${roleArn}`);
        }

        // Cost Explorer disponível apenas em us-east-1
        return new CostExplorerClient({
            region: 'us-east-1',
            credentials: {
                accessKeyId: awsCreds.AccessKeyId,
                secretAccessKey: awsCreds.SecretAccessKey,
                sessionToken: awsCreds.SessionToken,
            },
        });
    }
}
