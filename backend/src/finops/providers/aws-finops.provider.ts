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
        const { roleArn, externalId, region } = credentials as {
            roleArn: string;
            externalId?: string;
            region?: string;
        };

        this.logger.log(`[AWS FinOps] Coletando custos para conta ${cloudAccountId} (${startDate} → ${endDate}, ${granularity})`);

        const awsClient = await this.buildCostExplorerClient(roleArn, externalId, region ?? 'us-east-1');
        const exclusiveEndDate = this.toExclusiveEndDate(endDate);

        const input: GetCostAndUsageCommandInput = {
            // AWS Cost Explorer interpreta End como exclusivo.
            TimePeriod: { Start: startDate, End: exclusiveEndDate },
            Granularity: granularity,
            Metrics: ['UnblendedCost'],
            GroupBy: [
                { Type: 'DIMENSION', Key: 'SERVICE' },
                { Type: 'DIMENSION', Key: 'REGION' },
            ],
        };

        const response = await awsClient.send(new GetCostAndUsageCommand(input));

        const entries: Array<{ service: string; region: string | null; cost: number; currency: string; date: string }> = [];
        const currency = 'USD';

        for (const result of response.ResultsByTime ?? []) {
            const periodStart = result.TimePeriod?.Start ?? startDate;

            for (const group of result.Groups ?? []) {
                const [service, region] = group.Keys ?? ['Unknown', ''];
                const amount = Number(group.Metrics?.['UnblendedCost']?.Amount ?? '0');

                if (amount <= 0) {
                    continue;
                }

                entries.push({
                    service: service ?? 'Unknown',
                    region: region || null,
                    cost: amount,
                    currency,
                    date: periodStart,
                });
            }
        }

        this.logger.log(`[AWS FinOps] ${entries.length} registros coletados para conta ${cloudAccountId}`);

        return { entries, currency };
    }

    private toExclusiveEndDate(endDate: string): string {
        const [yearStr, monthStr, dayStr] = endDate.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);
        const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

        return nextDay.toISOString().slice(0, 10);
    }

    private async buildCostExplorerClient(
        roleArn: string,
        externalId: string | undefined,
        region: string,
    ): Promise<CostExplorerClient> {
        const stsRegion = this.configService.get<string>('AWS_STS_REGION', 'us-east-1');

        const sts = new STSClient({ region: stsRegion });

        const assumeRoleInput: AssumeRoleCommandInput = {
            RoleArn: roleArn,
            RoleSessionName: 'FinopsSession',
            DurationSeconds: 3600,
            ...(externalId ? { ExternalId: externalId } : {}),
        };

        const assumed = await sts.send(new AssumeRoleCommand(assumeRoleInput));

        const credentials = assumed.Credentials;

        if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
            throw new Error(`[AWS FinOps] Falha ao assumir role ${roleArn}: credenciais inválidas retornadas pelo STS`);
        }

        // Cost Explorer está disponível apenas em us-east-1
        return new CostExplorerClient({
            region: 'us-east-1',
            credentials: {
                accessKeyId: credentials.AccessKeyId,
                secretAccessKey: credentials.SecretAccessKey,
                sessionToken: credentials.SessionToken,
            },
        });
    }
}
