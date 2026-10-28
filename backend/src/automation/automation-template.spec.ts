import { BadRequestException } from '@nestjs/common';
import { ECS_SERVICE_TEMPLATE } from './templates/ecs-service.template';
import { extractTemplateDocument } from './template-document';
import {
    buildStackName,
    detectCapabilities,
    isSuccessfulStackStatus,
    redactSensitive,
    resolveIdempotentSlot,
    templateVisibleToTenant,
} from './bindings';
import { toCloudFormationParameters } from './cloudformation-automation.service';
import { AutomationInventorySyncService } from './automation-inventory-sync.service';
import { estimateStackMonthlyCost } from './stack-cost';
import { decryptJson, encryptJson } from './parameter-cipher';

describe('template document', () => {
    it('extrai parâmetros, recursos e outputs do template ECS sem chamar a AWS', () => {
        const extracted = extractTemplateDocument(ECS_SERVICE_TEMPLATE);
        expect(extracted.resources.map((resource) => resource.type)).toEqual(
            expect.arrayContaining(['AWS::ECS::Cluster', 'AWS::ECS::Service', 'AWS::ElasticLoadBalancingV2::LoadBalancer']),
        );
        expect(extracted.parameters.find((parameter) => parameter.name === 'SecretArn')?.noEcho).toBe(true);
        expect(extracted.outputs.map((output) => output.name)).toContain('ClusterName');
        expect(extracted.capabilities).toContain('CAPABILITY_NAMED_IAM');
        expect(extracted.conditions).toEqual(expect.arrayContaining(['UseHttps', 'UseHttpOnly']));
        expect(extracted.resources.map((resource) => resource.logicalId)).toEqual(expect.arrayContaining(['HttpsListener', 'HttpRedirectListener']));
        expect(extracted.resources.find((resource) => resource.logicalId === 'Cluster')?.condition).toBe('CreateCluster');
        expect(extracted.resources.find((resource) => resource.logicalId === 'Service')?.references).toEqual(
            expect.arrayContaining(['TaskDefinition', 'ServiceSecurityGroup']),
        );
        expect(ECS_SERVICE_TEMPLATE).toContain('public.ecr.aws/docker/library/nginx:alpine');
    });

    it('rejeita template sem recursos', () => {
        expect(() => extractTemplateDocument('{"Parameters":{}}')).toThrow(BadRequestException);
    });

    it('rejeita recurso customizado, stack aninhada e código de usuário', () => {
        const custom = JSON.stringify({ Resources: { Hook: { Type: 'Custom::Hook', Properties: {} } } });
        const nested = JSON.stringify({ Resources: { Child: { Type: 'AWS::CloudFormation::Stack', Properties: { TemplateURL: 'https://example.com/t.yaml' } } } });
        const lambda = JSON.stringify({ Resources: { Fn: { Type: 'AWS::Lambda::Function', Properties: {} } } });
        expect(() => extractTemplateDocument(custom)).toThrow(BadRequestException);
        expect(() => extractTemplateDocument(nested)).toThrow(BadRequestException);
        expect(() => extractTemplateDocument(lambda)).toThrow(BadRequestException);
    });
});

describe('automation safety helpers', () => {
    it('redige parâmetros sensíveis e preserva ARN', () => {
        const redacted = redactSensitive(
            { SecretArn: 'secret-value', secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:app', password: 'x' },
            new Set(['SecretArn']),
        ) as Record<string, string>;
        expect(redacted.SecretArn).toBe('[REDACTED]');
        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.secretArn).toContain('arn:aws:secretsmanager');
    });

    it('isola template de outra organização', () => {
        expect(templateVisibleToTenant({ tenantId: null }, 'org-a')).toBe(true);
        expect(templateVisibleToTenant({ tenantId: 'org-a' }, 'org-a')).toBe(true);
        expect(templateVisibleToTenant({ tenantId: 'org-b' }, 'org-a')).toBe(false);
    });

    it('impede execução duplicada e reutiliza o mesmo clientRequestId', () => {
        expect(resolveIdempotentSlot(true, true)).toBe('reuse');
        expect(resolveIdempotentSlot(false, true)).toBe('blocked');
        expect(resolveIdempotentSlot(false, false)).toBe('proceed');
    });

    it('monta parâmetros CloudFormation e nome de stack estável', () => {
        expect(toCloudFormationParameters({ DesiredCount: 2, SubnetIds: ['subnet-a', 'subnet-b'] })).toEqual([
            { ParameterKey: 'DesiredCount', ParameterValue: '2' },
            { ParameterKey: 'SubnetIds', ParameterValue: 'subnet-a,subnet-b' },
        ]);
        const automationId = '11111111-2222-3333-4444-555555555555';
        expect(buildStackName('app', automationId)).toBe(buildStackName('app', automationId));
        expect(buildStackName('app', automationId).startsWith('smc-app-')).toBe(true);
    });

    it('distingue sucesso de stack de falha terminal', () => {
        expect(isSuccessfulStackStatus('CREATE_COMPLETE')).toBe(true);
        expect(isSuccessfulStackStatus('ROLLBACK_COMPLETE')).toBe(false);
    });

    it('pede capability IAM só quando o template declara IAM', () => {
        expect(detectCapabilities(['AWS::ECS::Service'], false)).toEqual([]);
        expect(detectCapabilities(['AWS::IAM::Role'], true)).toEqual(['CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND']);
    });

    it('estima Fargate e o ALB quando cpu, memória e contagem são literais', () => {
        const extracted = extractTemplateDocument(ECS_SERVICE_TEMPLATE);
        const estimate = estimateStackMonthlyCost(extracted.resources, {
            Cpu: '256',
            Memory: '512',
            DesiredCount: 2,
            AssignPublicIp: 'ENABLED',
            CreateLoadBalancer: 'true',
        });
        expect(estimate).toBeGreaterThan(40);
        expect(estimateStackMonthlyCost(extracted.resources, { Cpu: { type: 'VARIABLE' } })).toBeNull();
    });

    it('criptografa parâmetros de execução e não devolve o valor em claro', () => {
        const key = 'a'.repeat(64);
        const encrypted = encryptJson({ SecretArn: 'top-secret' }, key);
        expect(encrypted).not.toContain('top-secret');
        expect(decryptJson(encrypted, key)).toEqual({ SecretArn: 'top-secret' });
    });

    it('mapeia recursos da stack para famílias do inventário', () => {
        const sync = new AutomationInventorySyncService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );
        expect(sync.familiesFor(['AWS::ECS::Cluster', 'AWS::ECS::Service', 'AWS::ECR::Repository'])).toEqual(['ecs', 'ecr']);
    });
});
