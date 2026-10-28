import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
    Capability,
    CloudFormationClient,
    CreateChangeSetCommand,
    DeleteChangeSetCommand,
    DeleteStackCommand,
    DescribeChangeSetCommand,
    DescribeStackResourcesCommand,
    DescribeStacksCommand,
    ExecuteChangeSetCommand,
    ValidateTemplateCommand,
    type Parameter,
} from '@aws-sdk/client-cloudformation';
import { AwsConnectorService } from '../aws/aws-connector.service';
import { ErrorMessages } from '../common/messages/error-messages';
import { isSuccessfulStackStatus, isTerminalStackStatus } from './bindings';

export interface ChangeSetRequest {
    cloudAccountId: string;
    organizationId: string;
    region: string;
    stackName: string;
    changeSetName: string;
    templateBody: string;
    parameters: Record<string, unknown>;
    capabilities: string[];
}

export interface ChangeSetSummary {
    stackName: string;
    changeSetName: string;
    changeSetId?: string;
    status?: string;
    statusReason?: string;
    stackId?: string;
    changes: Array<{ action?: string; logicalId?: string; resourceType?: string; replacement?: string }>;
}

const CHANGE_SET_READY = new Set(['CREATE_COMPLETE']);
const CHANGE_SET_FAILED = new Set(['FAILED', 'DELETE_COMPLETE']);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toCloudFormationParameters(parameters: Record<string, unknown>): Parameter[] {
    return Object.entries(parameters)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => ({
            ParameterKey: key,
            ParameterValue: Array.isArray(value) ? value.map(String).join(',') : String(value),
        }));
}

function isMissingStack(error: unknown): boolean {
    const message = error instanceof Error ? error.message : '';
    return message.includes('does not exist');
}

@Injectable()
export class CloudFormationAutomationService {
    private readonly logger = new Logger(CloudFormationAutomationService.name);

    constructor(private readonly connector: AwsConnectorService) {}

    async validateTemplate(cloudAccountId: string, organizationId: string, region: string, templateBody: string) {
        const client = await this.client(cloudAccountId, organizationId, region);
        const response = await client.send(new ValidateTemplateCommand({ TemplateBody: templateBody }));
        return {
            description: response.Description ?? null,
            parameters: (response.Parameters ?? []).map((parameter) => ({
                key: parameter.ParameterKey,
                defaultValue: parameter.DefaultValue,
                noEcho: parameter.NoEcho === true,
            })),
            capabilities: response.Capabilities ?? [],
        };
    }

    async openChangeSet(request: ChangeSetRequest): Promise<ChangeSetSummary> {
        const client = await this.client(request.cloudAccountId, request.organizationId, request.region);
        const exists = await this.stackExists(client, request.stackName);
        const response = await client.send(
            new CreateChangeSetCommand({
                StackName: request.stackName,
                ChangeSetName: request.changeSetName,
                TemplateBody: request.templateBody,
                Parameters: toCloudFormationParameters(request.parameters),
                Capabilities: request.capabilities as Capability[],
                ChangeSetType: exists ? 'UPDATE' : 'CREATE',
            }),
        );

        const summary = await this.waitForChangeSet(client, request.stackName, request.changeSetName);
        return { ...summary, changeSetId: response.Id ?? summary.changeSetId, stackId: response.StackId ?? summary.stackId };
    }

    async executeChangeSet(cloudAccountId: string, organizationId: string, region: string, changeSetName: string, stackName: string) {
        const client = await this.client(cloudAccountId, organizationId, region);
        await client.send(new ExecuteChangeSetCommand({ ChangeSetName: changeSetName, StackName: stackName }));
        return this.waitForStack(client, stackName);
    }

    async describeStackResources(cloudAccountId: string, organizationId: string, region: string, stackName: string) {
        const client = await this.client(cloudAccountId, organizationId, region);
        const response = await client.send(new DescribeStackResourcesCommand({ StackName: stackName }));
        return (response.StackResources ?? []).map((resource) => ({
            logicalId: resource.LogicalResourceId ?? '',
            physicalId: resource.PhysicalResourceId ?? null,
            type: resource.ResourceType ?? '',
            status: resource.ResourceStatus ?? '',
        }));
    }

    async discardReviewStack(cloudAccountId: string, organizationId: string, region: string, stackName: string, changeSetName: string) {
        const client = await this.client(cloudAccountId, organizationId, region);
        try {
            await client.send(new DeleteChangeSetCommand({ ChangeSetName: changeSetName, StackName: stackName }));
        } catch (error) {
            this.logger.warn(`automation.changeset.delete_failed stack=${stackName}`);
        }

        try {
            const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
            const status = described.Stacks?.[0]?.StackStatus;
            if (status === 'REVIEW_IN_PROGRESS') {
                await client.send(new DeleteStackCommand({ StackName: stackName }));
            }
        } catch (error) {
            if (!isMissingStack(error)) {
                this.logger.warn(`automation.stack.discard_failed stack=${stackName}`);
            }
        }
    }

    async deleteCreatedStack(cloudAccountId: string, organizationId: string, region: string, stackName: string): Promise<void> {
        const client = await this.client(cloudAccountId, organizationId, region);
        await client.send(new DeleteStackCommand({ StackName: stackName }));
        await this.waitForDeletion(client, stackName);
    }

    async cleanupFailedCreate(cloudAccountId: string, organizationId: string, region: string, stackName: string): Promise<void> {
        const client = await this.client(cloudAccountId, organizationId, region);
        try {
            const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
            const status = described.Stacks?.[0]?.StackStatus;
            if (!status || !['ROLLBACK_COMPLETE', 'ROLLBACK_FAILED', 'CREATE_FAILED', 'REVIEW_IN_PROGRESS'].includes(status)) return;
            await client.send(new DeleteStackCommand({ StackName: stackName }));
            await this.waitForDeletion(client, stackName);
        } catch (error) {
            if (!isMissingStack(error)) {
                this.logger.warn(`automation.stack.cleanup_failed stack=${stackName}`);
            }
        }
    }

    private async client(cloudAccountId: string, organizationId: string, region: string): Promise<CloudFormationClient> {
        return this.connector.getCloudFormationClient(cloudAccountId, organizationId, region);
    }

    private async stackExists(client: CloudFormationClient, stackName: string): Promise<boolean> {
        try {
            const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
            const status = described.Stacks?.[0]?.StackStatus;
            return Boolean(status && status !== 'REVIEW_IN_PROGRESS' && status !== 'DELETE_COMPLETE');
        } catch (error) {
            if (isMissingStack(error)) return false;
            throw error;
        }
    }

    private async waitForChangeSet(client: CloudFormationClient, stackName: string, changeSetName: string): Promise<ChangeSetSummary> {
        const deadline = Date.now() + 3 * 60 * 1000;
        while (Date.now() < deadline) {
            const described = await client.send(new DescribeChangeSetCommand({ StackName: stackName, ChangeSetName: changeSetName }));
            const status = described.Status;
            if (status && CHANGE_SET_READY.has(status)) {
                return this.toSummary(described);
            }
            if (status && CHANGE_SET_FAILED.has(status)) {
                if ((described.StatusReason ?? '').includes('didn\'t contain changes')) {
                    return this.toSummary(described);
                }
                throw new BadRequestException(described.StatusReason || ErrorMessages.AUTOMATION.TEMPLATE_INVALID);
            }
            await sleep(3000);
        }
        throw new BadRequestException(ErrorMessages.AUTOMATION.STACK_FAILED);
    }

    private async waitForStack(client: CloudFormationClient, stackName: string) {
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
            const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
            const stack = described.Stacks?.[0];
            const status = stack?.StackStatus;
            if (isTerminalStackStatus(status)) {
                if (!isSuccessfulStackStatus(status)) {
                    throw new BadRequestException(stack?.StackStatusReason || ErrorMessages.AUTOMATION.STACK_FAILED);
                }
                const outputs: Record<string, string> = {};
                for (const output of stack?.Outputs ?? []) {
                    if (output.OutputKey) outputs[output.OutputKey] = output.OutputValue ?? '';
                }
                return {
                    stackId: stack?.StackId ?? stackName,
                    stackName,
                    stackStatus: status ?? '',
                    outputs,
                };
            }
            await sleep(5000);
        }
        throw new BadRequestException(ErrorMessages.AUTOMATION.STACK_FAILED);
    }

    private async waitForDeletion(client: CloudFormationClient, stackName: string): Promise<void> {
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
            try {
                const described = await client.send(new DescribeStacksCommand({ StackName: stackName }));
                const status = described.Stacks?.[0]?.StackStatus;
                if (!status || status === 'DELETE_COMPLETE') return;
                if (status === 'DELETE_FAILED') {
                    throw new BadRequestException(described.Stacks?.[0]?.StackStatusReason || ErrorMessages.AUTOMATION.STACK_FAILED);
                }
            } catch (error) {
                if (error instanceof BadRequestException) throw error;
                if (isMissingStack(error)) return;
                throw error;
            }
            await sleep(5000);
        }
        throw new BadRequestException(ErrorMessages.AUTOMATION.STACK_FAILED);
    }

    private toSummary(described: {
        ChangeSetId?: string;
        Status?: string;
        StatusReason?: string;
        StackId?: string;
        Changes?: Array<{ ResourceChange?: { Action?: string; LogicalResourceId?: string; ResourceType?: string; Replacement?: string } }>;
    }): ChangeSetSummary {
        return {
            stackName: '',
            changeSetName: '',
            changeSetId: described.ChangeSetId,
            status: described.Status,
            statusReason: described.StatusReason,
            stackId: described.StackId,
            changes: (described.Changes ?? []).map((change) => ({
                action: change.ResourceChange?.Action,
                logicalId: change.ResourceChange?.LogicalResourceId,
                resourceType: change.ResourceChange?.ResourceType,
                replacement: change.ResourceChange?.Replacement,
            })),
        };
    }
}
