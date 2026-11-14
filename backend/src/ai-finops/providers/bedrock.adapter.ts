import { Injectable, Logger } from '@nestjs/common';
import {
    BedrockClient,
    ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock';
import {
    CostExplorerClient,
    GetCostAndUsageCommand,
} from '@aws-sdk/client-cost-explorer';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { ConfigService } from '@nestjs/config';
import type {
    AiProviderAdapter,
    AiProviderCapabilities,
    AiProviderCostEntry,
    AiProviderModelInfo,
    AiProviderUsageEntry,
    AiProviderValidateResult,
} from './ai-provider.adapter';

/**
 * AWS Bedrock BYOK via AssumeRole + Cost Explorer.
 * Official $ from CE; UsageQuantity when present (not chat token IDs).
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html
 */
@Injectable()
export class BedrockFinopsAdapter implements AiProviderAdapter {
    readonly slug = 'aws_bedrock';
    readonly capabilities: AiProviderCapabilities = {
        validateCredentials: true,
        listModels: true,
        listProjects: false,
        fetchUsage: true,
        fetchCosts: true,
        fetchLimits: false,
        usageByUser: false,
        syncHistorical: true,
    };

    private readonly logger = new Logger(BedrockFinopsAdapter.name);

    constructor(private readonly configService: ConfigService) {}

    private region(creds: Record<string, unknown>): string {
        return typeof creds.region === 'string' && creds.region.trim()
            ? creds.region.trim()
            : 'us-east-1';
    }

    private async assumeRole(creds: Record<string, unknown>) {
        const roleArn = typeof creds.roleArn === 'string' ? creds.roleArn.trim() : '';
        if (!roleArn) {
            throw new Error('BEDROCK_ROLE_ARN_MISSING');
        }
        const externalId =
            typeof creds.externalId === 'string' && creds.externalId.trim()
                ? creds.externalId.trim()
                : undefined;

        const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
        const stsRegion = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';

        const sts = new STSClient({
            region: stsRegion,
            ...(accessKeyId && secretAccessKey
                ? { credentials: { accessKeyId, secretAccessKey } }
                : {}),
        });

        const assumed = await sts.send(
            new AssumeRoleCommand({
                RoleArn: roleArn,
                RoleSessionName: 'AiFinopsBedrockSession',
                DurationSeconds: 3600,
                ...(externalId ? { ExternalId: externalId } : {}),
            }),
        );

        const c = assumed.Credentials;
        if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
            throw new Error('BEDROCK_STS_INCOMPLETE');
        }
        return {
            accessKeyId: c.AccessKeyId,
            secretAccessKey: c.SecretAccessKey,
            sessionToken: c.SessionToken,
        };
    }

    async validateCredentials(creds: Record<string, unknown>): Promise<AiProviderValidateResult> {
        try {
            const temporary = await this.assumeRole(creds);
            const client = new BedrockClient({
                region: this.region(creds),
                credentials: temporary,
            });
            await client.send(new ListFoundationModelsCommand({ byOutputModality: 'TEXT' }));
            return {
                ok: true,
                message:
                    'AWS Bedrock credentials validated via AssumeRole + ListFoundationModels. Costs sync via Cost Explorer (Amazon Bedrock).',
                accountId: typeof creds.accountId === 'string' ? creds.accountId : null,
            };
        } catch (error) {
            this.logger.warn(`bedrock.validate.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return {
                ok: false,
                message: 'Could not validate AWS Bedrock credentials (role/region/permissions).',
            };
        }
    }

    async listModels(creds: Record<string, unknown>): Promise<AiProviderModelInfo[]> {
        const temporary = await this.assumeRole(creds);
        const client = new BedrockClient({
            region: this.region(creds),
            credentials: temporary,
        });
        const response = await client.send(new ListFoundationModelsCommand({}));
        return (response.modelSummaries ?? [])
            .filter((m) => typeof m.modelId === 'string' && m.modelId.length > 0)
            .map((m) => ({
                modelIdentifier: m.modelId as string,
                displayName: m.modelName ?? (m.modelId as string),
                modality: m.outputModalities?.[0] ?? null,
                contextWindow: null,
                capabilities: {
                    providerName: m.providerName ?? null,
                    inputModalities: m.inputModalities ?? [],
                },
            }));
    }

    async fetchCosts(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderCostEntry[]> {
        try {
            const temporary = await this.assumeRole(creds);
            const client = new CostExplorerClient({
                region: 'us-east-1',
                credentials: temporary,
            });
            const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
            endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

            const response = await client.send(
                new GetCostAndUsageCommand({
                    TimePeriod: {
                        Start: startDate,
                        End: endExclusive.toISOString().slice(0, 10),
                    },
                    Granularity: 'DAILY',
                    Metrics: ['UnblendedCost', 'UsageQuantity'],
                    Filter: {
                        Dimensions: {
                            Key: 'SERVICE',
                            Values: ['Amazon Bedrock'],
                        },
                    },
                    GroupBy: [{ Type: 'DIMENSION', Key: 'USAGE_TYPE' }],
                }),
            );

            const entries: AiProviderCostEntry[] = [];
            for (const result of response.ResultsByTime ?? []) {
                const date = result.TimePeriod?.Start ?? startDate;
                for (const group of result.Groups ?? []) {
                    const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0);
                    if (!Number.isFinite(amount) || amount === 0) continue;
                    const usageQty = Number(group.Metrics?.UsageQuantity?.Amount ?? 0);
                    entries.push({
                        date,
                        model: group.Keys?.[0] ?? 'Amazon Bedrock',
                        cost: amount,
                        currency: group.Metrics?.UnblendedCost?.Unit ?? 'USD',
                        metadata: {
                            source: 'aws_cost_explorer_bedrock',
                            usageQuantity: Number.isFinite(usageQty) ? usageQty : null,
                            usageQuantityUnit: group.Metrics?.UsageQuantity?.Unit ?? null,
                        },
                    });
                }
            }
            return entries;
        } catch (error) {
            this.logger.warn(`bedrock.fetchCosts.error: ${error instanceof Error ? error.message : 'unknown'}`);
            return [];
        }
    }

    async fetchUsage(
        creds: Record<string, unknown>,
        startDate: string,
        endDate: string,
    ): Promise<AiProviderUsageEntry[]> {
        const costs = await this.fetchCosts(creds, startDate, endDate);
        return costs.map((cost, index) => {
            const qty = Number(cost.metadata?.usageQuantity ?? 0);
            const looksLikeTokens =
                typeof cost.metadata?.usageQuantityUnit === 'string' &&
                /token/i.test(cost.metadata.usageQuantityUnit);
            const tokenish = looksLikeTokens && Number.isFinite(qty) ? Math.floor(qty) : 0;
            return {
                occurredAt: new Date(`${cost.date}T12:00:00.000Z`),
                model: cost.model ?? 'amazon-bedrock',
                inputTokens: tokenish,
                outputTokens: 0,
                totalTokens: tokenish,
                officialCost: cost.cost,
                currency: cost.currency,
                providerRequestId: `bedrock-ce-${cost.date}-${index}-${cost.model ?? 'na'}`,
                metadata: {
                    source: 'aws_cost_explorer_bedrock',
                    usageQuantity: cost.metadata?.usageQuantity ?? null,
                    usageQuantityUnit: cost.metadata?.usageQuantityUnit ?? null,
                    note: looksLikeTokens
                        ? 'UsageQuantity mapped when CE unit indicates tokens.'
                        : 'Official cost from CE; token counts only when UsageQuantity unit is tokens.',
                },
            };
        });
    }
}
