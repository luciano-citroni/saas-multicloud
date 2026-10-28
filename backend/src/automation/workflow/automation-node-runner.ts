import { BadRequestException, Injectable } from '@nestjs/common';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AwsConnectorService } from '../../aws/aws-connector.service';
import { ErrorMessages } from '../../common/messages/error-messages';
import { actionProviderPrefix, AUTOMATION_ACTION_TYPES } from '../constants';
import { AwsAutomationProvider } from '../providers/aws/aws-automation-provider';
import { AzureAutomationProvider } from '../providers/azure/azure-automation-provider';
import { GcpAutomationProvider } from '../providers/gcp/gcp-automation-provider';
import { AutomationInventorySyncService } from '../automation-inventory-sync.service';
import { CloudFormationAutomationService } from '../cloudformation-automation.service';
import { ExistingResourceService } from '../existing-resource.service';
import { buildStackName } from '../bindings';
import type { EmbeddedWorkflowTemplate } from './workflow.types';

export interface PreparedChangeSet {
    nodeId: string;
    region: string;
    stackName: string;
    changeSetName: string;
}

export interface NodeRunContext {
    cloudAccountId: string;
    tenantId: string;
    executionId: string;
    automationId: string;
    nodeId: string;
    cloudProvider?: 'AWS' | 'GCP' | 'AZURE';
    template?: EmbeddedWorkflowTemplate;
    acknowledgeCapabilities: boolean;
    preparedChangeSet?: PreparedChangeSet;
}

export interface NodeRunResult {
    output: Record<string, unknown>;
    resourceId: string | null;
    awsOperationId?: string | null;
    sensitiveKeys?: string[];
    inventorySyncStatus?: 'SYNCED' | 'FAILED' | 'NOT_APPLICABLE';
    rollback?: { region: string; stackName: string; stackId: string };
    provisioned?: Array<{ resourceType: string; awsResourceId: string | null; arn: string | null; region: string; stackId: string | null }>;
}

@Injectable()
export class AutomationNodeRunner {
    constructor(
        private readonly awsProvider: AwsAutomationProvider,
        private readonly azureProvider: AzureAutomationProvider,
        private readonly gcpProvider: GcpAutomationProvider,
        private readonly cloudFormation: CloudFormationAutomationService,
        private readonly existingResources: ExistingResourceService,
        private readonly inventorySync: AutomationInventorySyncService,
        private readonly connector: AwsConnectorService,
    ) {}

    async run(type: string, config: Record<string, unknown>, context: NodeRunContext): Promise<NodeRunResult> {
        switch (type) {
            case AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK:
                return this.runStack(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_EXISTING_RESOURCE:
                return this.runExisting(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_DATA_INPUT:
                return { output: (config.values as Record<string, unknown>) ?? {}, resourceId: null, inventorySyncStatus: 'NOT_APPLICABLE' };
            case AUTOMATION_ACTION_TYPES.AWS_CALLER_IDENTITY:
                return this.runCallerIdentity(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_REFRESH_INVENTORY:
                return this.runRefresh(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE:
                return this.dispatchNative(type, { ...config, originDomainName: config.origin }, context);
            default:
                return this.dispatchNative(type, config, context);
        }
    }

    private async dispatchNative(
        type: string,
        config: Record<string, unknown>,
        context: NodeRunContext,
    ): Promise<NodeRunResult> {
        const provider = context.cloudProvider ?? actionProviderPrefix(type) ?? 'AWS';
        const providerContext = { cloudAccountId: context.cloudAccountId, tenantId: context.tenantId };

        if (provider === 'AZURE') {
            const result = await this.azureProvider.executeAction(type, config, providerContext);
            return {
                ...result,
                inventorySyncStatus: 'NOT_APPLICABLE',
                provisioned: result.resourceId
                    ? [
                          {
                              resourceType: type,
                              awsResourceId: result.resourceId,
                              arn: typeof result.output.arn === 'string' ? result.output.arn : null,
                              region: String(config.region ?? 'us-east-1'),
                              stackId: null,
                          },
                      ]
                    : [],
            };
        }
        if (provider === 'GCP') {
            const result = await this.gcpProvider.executeAction(type, config, providerContext);
            return {
                ...result,
                inventorySyncStatus: 'NOT_APPLICABLE',
                provisioned: result.resourceId
                    ? [
                          {
                              resourceType: type,
                              awsResourceId: result.resourceId,
                              arn: typeof result.output.arn === 'string' ? result.output.arn : null,
                              region: String(config.region ?? 'us-east-1'),
                              stackId: null,
                          },
                      ]
                    : [],
            };
        }

        const result = await this.awsProvider.executeAction(type, config, providerContext);
        const arnCandidates = ['arn', 'bucketArn', 'roleArn', 'functionArn', 'loadBalancerArn', 'repositoryArn', 'clusterArn', 'taskDefinitionArn', 'appArn'];
        const arn = arnCandidates.map((key) => result.output[key]).find((value): value is string => typeof value === 'string') ?? null;
        return {
            ...result,
            inventorySyncStatus: 'NOT_APPLICABLE',
            provisioned: result.resourceId
                ? [
                      {
                          resourceType: type,
                          awsResourceId: result.resourceId,
                          arn,
                          region: String(config.region ?? 'us-east-1'),
                          stackId: null,
                      },
                  ]
                : [],
        };
    }

    private async runStack(config: Record<string, unknown>, context: NodeRunContext): Promise<NodeRunResult> {
        const template = context.template;
        if (!template) throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_NOT_FOUND);
        const region = String(config.region);
        const stackName = buildStackName(String(config.stackName), context.automationId);
        const needsIam = template.capabilities.some((capability) => capability.includes('IAM'));
        if (needsIam && config.capabilitiesConfirmed !== true && !context.acknowledgeCapabilities) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.CAPABILITY_NOT_CONFIRMED);
        }
        const capabilities = needsIam || context.acknowledgeCapabilities ? template.capabilities : template.capabilities.filter((item) => !item.includes('IAM'));
        const parameters = (config.parameters as Record<string, unknown>) ?? {};
        const prepared = context.preparedChangeSet;
        const changeSetName = prepared?.changeSetName ?? `smc-${context.executionId.replace(/-/g, '').slice(0, 12)}-${context.nodeId.replace(/-/g, '').slice(0, 8)}`;
        const effectiveStackName = prepared?.stackName ?? stackName;

        if (!prepared) {
            await this.cloudFormation.validateTemplate(context.cloudAccountId, context.tenantId, region, template.content);
            await this.cloudFormation.openChangeSet({
                cloudAccountId: context.cloudAccountId,
                organizationId: context.tenantId,
                region,
                stackName,
                changeSetName,
                templateBody: template.content,
                parameters,
                capabilities,
            });
        }

        let stack;
        try {
            stack = await this.cloudFormation.executeChangeSet(context.cloudAccountId, context.tenantId, region, changeSetName, effectiveStackName);
        } catch (error) {
            await this.cloudFormation.cleanupFailedCreate(context.cloudAccountId, context.tenantId, region, effectiveStackName);
            throw error;
        }
        const resources = await this.cloudFormation.describeStackResources(context.cloudAccountId, context.tenantId, region, stack.stackName);
        const errors = await this.inventorySync.syncStackResources(context.cloudAccountId, context.tenantId, region, resources);

        return {
            output: { stackId: stack.stackId, stackName: stack.stackName, stackStatus: stack.stackStatus, outputs: stack.outputs, ...stack.outputs },
            resourceId: stack.stackId,
            awsOperationId: stack.stackId,
            sensitiveKeys: template.parameters.filter((parameter) => parameter.noEcho).map((parameter) => parameter.name),
            inventorySyncStatus: errors.length ? 'FAILED' : resources.length ? 'SYNCED' : 'NOT_APPLICABLE',
            rollback: stack.stackStatus === 'CREATE_COMPLETE' ? { region, stackName: stack.stackName, stackId: stack.stackId } : undefined,
            provisioned: resources.map((resource) => ({
                resourceType: resource.type,
                awsResourceId: resource.physicalId,
                arn: resource.physicalId?.startsWith('arn:') ? resource.physicalId : null,
                region,
                stackId: stack.stackId,
            })),
        };
    }

    private async runExisting(config: Record<string, unknown>, context: NodeRunContext): Promise<NodeRunResult> {
        const output = await this.existingResources.verify(
            context.cloudAccountId,
            context.tenantId,
            String(config.resourceType),
            String(config.region),
            String(config.resourceId),
        );
        return { output, resourceId: String(config.resourceId), inventorySyncStatus: 'NOT_APPLICABLE' };
    }

    private async runCallerIdentity(config: Record<string, unknown>, context: NodeRunContext): Promise<NodeRunResult> {
        const region = typeof config.region === 'string' ? config.region : undefined;
        const creds = await this.connector.resolveRoleCredentials(context.cloudAccountId, context.tenantId);
        const finalRegion = region || creds.region;
        const temporary = await this.connector.assumeRole({ ...creds, region: finalRegion });
        const sts = new STSClient({ region: finalRegion, credentials: temporary });
        const identity = await sts.send(new GetCallerIdentityCommand({}));
        return {
            output: { account: identity.Account ?? '', arn: identity.Arn ?? '', userId: identity.UserId ?? '' },
            resourceId: identity.Account ?? null,
            inventorySyncStatus: 'NOT_APPLICABLE',
        };
    }

    private async runRefresh(config: Record<string, unknown>, context: NodeRunContext): Promise<NodeRunResult> {
        const families = Array.isArray(config.families) ? config.families.map(String) : [];
        const errors = await this.inventorySync.syncFamilies(context.cloudAccountId, context.tenantId, String(config.region), families);
        if (errors.length) {
            throw new BadRequestException(errors.join('; '));
        }
        return { output: { refreshed: families, errors }, resourceId: null, inventorySyncStatus: 'SYNCED' };
    }
}
