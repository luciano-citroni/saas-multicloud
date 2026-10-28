import { CloudFormationAutomationService } from './cloudformation-automation.service';

class FakeCloudFormationClient {
    calls: string[] = [];

    async send(command: { constructor: { name: string } }) {
        const name = command.constructor.name;
        this.calls.push(name);
        if (name === 'DescribeStacksCommand' && this.calls.filter((call) => call === name).length === 1) {
            throw new Error('Stack with id app does not exist');
        }
        if (name === 'ValidateTemplateCommand') return { Description: 'ok', Parameters: [], Capabilities: ['CAPABILITY_NAMED_IAM'] };
        if (name === 'CreateChangeSetCommand') return { Id: 'cs-1', StackId: 'stack-1' };
        if (name === 'DescribeChangeSetCommand') return { Status: 'CREATE_COMPLETE', Changes: [], ChangeSetId: 'cs-1', StackId: 'stack-1' };
        if (name === 'ExecuteChangeSetCommand') return {};
        if (name === 'DescribeStacksCommand') {
            return { Stacks: [{ StackId: 'stack-1', StackStatus: 'CREATE_COMPLETE', Outputs: [{ OutputKey: 'ClusterName', OutputValue: 'app-dev' }] }] };
        }
        if (name === 'DescribeStackResourcesCommand') {
            return { StackResources: [{ LogicalResourceId: 'Cluster', PhysicalResourceId: 'arn:aws:ecs:us-east-2:1:cluster/app', ResourceType: 'AWS::ECS::Cluster', ResourceStatus: 'CREATE_COMPLETE' }] };
        }
        return {};
    }
}

describe('CloudFormationAutomationService', () => {
    const client = new FakeCloudFormationClient();
    const connector = {
        getCloudFormationClient: async () => client,
    };
    const service = new CloudFormationAutomationService(connector as never);

    it('valida, abre change set e conclui a stack com cliente mockado', async () => {
        const validated = await service.validateTemplate('account', 'org', 'us-east-2', 'AWSTemplateFormatVersion: "2010-09-09"');
        expect(validated.capabilities).toContain('CAPABILITY_NAMED_IAM');

        const changeSet = await service.openChangeSet({
            cloudAccountId: 'account',
            organizationId: 'org',
            region: 'us-east-2',
            stackName: 'smc-app',
            changeSetName: 'plan-1',
            templateBody: 'body',
            parameters: { AppName: 'app' },
            capabilities: ['CAPABILITY_NAMED_IAM'],
        });
        expect(changeSet.status).toBe('CREATE_COMPLETE');

        const stack = await service.executeChangeSet('account', 'org', 'us-east-2', 'plan-1', 'smc-app');
        expect(stack.stackStatus).toBe('CREATE_COMPLETE');
        expect(stack.outputs.ClusterName).toBe('app-dev');
        expect(client.calls).not.toContain('CreateStackCommand');
    });
});
