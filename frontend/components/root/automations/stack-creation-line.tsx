'use client';

import { useTranslations, type Translations } from '@/lib/i18n';

export type StackResource = {
    logicalId: string;
    type: string;
    dependsOn?: string[];
    references?: string[];
    condition?: string;
};

type StackText = { [K in keyof Translations['automation']['stackCreation']]: string };

function getTypeLabels(s: StackText): Record<string, string> {
    return {
        'AWS::ECS::Cluster': s.typeEcsCluster,
        'AWS::ECS::Service': s.typeEcsService,
        'AWS::ECS::TaskDefinition': 'Task definition',
        'AWS::ECR::Repository': s.typeEcrRepository,
        'AWS::IAM::Role': s.typeIamRole,
        'AWS::IAM::Policy': s.typeIamPolicy,
        'AWS::Logs::LogGroup': s.typeLogGroup,
        'AWS::EC2::VPC': 'VPC',
        'AWS::EC2::Subnet': 'Subnet',
        'AWS::EC2::RouteTable': s.typeRouteTable,
        'AWS::EC2::NatGateway': 'NAT Gateway',
        'AWS::EC2::Instance': s.typeEc2Instance,
        'AWS::EC2::SecurityGroup': 'Security group',
        'AWS::EC2::SecurityGroupIngress': s.typeIngressRule,
        'AWS::ElasticLoadBalancingV2::LoadBalancer': 'Load balancer',
        'AWS::ElasticLoadBalancingV2::TargetGroup': 'Target group',
        'AWS::ElasticLoadBalancingV2::Listener': 'Listener',
        'AWS::S3::Bucket': s.typeS3Bucket,
        'AWS::Lambda::Function': s.typeLambda,
        'AWS::RDS::DBInstance': s.typeRds,
        'AWS::ApiGateway::RestApi': 'API Gateway',
        'AWS::Amplify::App': s.typeAmplify,
        'AWS::CloudFront::Distribution': 'CloudFront',
    };
}

type Creation = { included: boolean | null; how: string };

function isBlank(value: unknown): boolean | null {
    if (value && typeof value === 'object') return null;
    if (value == null) return true;
    return String(value).trim() === '';
}

function isLoadBalancerEnabled(parameters: Record<string, unknown>): boolean | null {
    const value = parameters.CreateLoadBalancer;
    if (value && typeof value === 'object') return null;
    if (value == null || String(value).trim() === '') return true;
    return String(value) === 'true';
}

function describe(s: StackText, condition: string | undefined, parameters: Record<string, unknown>): Creation {
    if (!condition) return { included: true, how: s.noCondition };

    const cluster = isBlank(parameters.ExistingClusterName);
    const repository = isBlank(parameters.ExistingRepositoryUri);
    const executionRole = isBlank(parameters.ExecutionRoleArn);
    const taskRole = isBlank(parameters.TaskRoleArn);
    const secret = isBlank(parameters.SecretArn);
    const certificate = isBlank(parameters.CertificateArn);
    const loadBalancer = isLoadBalancerEnabled(parameters);

    const rules: Record<string, () => Creation> = {
        CreateCluster: () =>
            cluster === null
                ? { included: null, how: s.clusterUnknown }
                : cluster
                  ? { included: true, how: s.clusterCreate }
                  : { included: false, how: s.clusterSkip },
        CreateRepository: () =>
            repository === null
                ? { included: null, how: s.repositoryUnknown }
                : repository
                  ? { included: true, how: s.repositoryCreate }
                  : { included: false, how: s.repositorySkip },
        CreateExecutionRole: () =>
            executionRole === null
                ? { included: null, how: s.executionRoleUnknown }
                : executionRole
                  ? { included: true, how: s.executionRoleCreate }
                  : { included: false, how: s.executionRoleSkip },
        CreateTaskRole: () =>
            taskRole === null
                ? { included: null, how: s.taskRoleUnknown }
                : taskRole
                  ? { included: true, how: s.taskRoleCreate }
                  : { included: false, how: s.taskRoleSkip },
        HasSecret: () =>
            secret === null
                ? { included: null, how: s.secretUnknown }
                : secret
                  ? { included: false, how: s.secretSkip }
                  : { included: true, how: s.secretUse },
        GrantSecretToNewRole: () => {
            if (executionRole === null || secret === null) {
                return { included: null, how: s.grantUnknown };
            }
            if (executionRole && !secret) return { included: true, how: s.grantCreate };
            return { included: false, how: s.grantSkip };
        },
        UseLoadBalancer: () =>
            loadBalancer === null
                ? { included: null, how: s.loadBalancerUnknown }
                : loadBalancer
                  ? { included: true, how: s.loadBalancerCreate }
                  : { included: false, how: s.loadBalancerSkip },
        SkipLoadBalancer: () =>
            loadBalancer === null
                ? { included: null, how: s.noLoadBalancerUnknown }
                : loadBalancer
                  ? { included: false, how: s.noLoadBalancerSkip }
                  : { included: true, how: s.noLoadBalancerCreate },
        UseHttps: () => {
            if (loadBalancer === null || certificate === null) {
                return { included: null, how: s.httpsUnknown };
            }
            if (loadBalancer && !certificate) return { included: true, how: s.httpsCreate };
            return { included: false, how: s.httpsSkip };
        },
        UseHttpOnly: () => {
            if (loadBalancer === null || certificate === null) {
                return { included: null, how: s.httpOnlyUnknown };
            }
            if (loadBalancer && certificate) return { included: true, how: s.httpOnlyCreate };
            return { included: false, how: s.httpOnlySkip };
        },
    };

    return rules[condition]?.() ?? { included: null, how: s.conditionFallback.replace('{condition}', condition) };
}

export function orderStackResources(resources: StackResource[]): StackResource[] {
    const index = new Map(resources.map((resource, position) => [resource.logicalId, position]));
    const ids = new Set(index.keys());
    const incoming = new Map<string, Set<string>>();
    const outgoing = new Map<string, string[]>();

    for (const resource of resources) {
        const deps = [...(resource.dependsOn ?? []), ...(resource.references ?? [])].filter(
            (id) => ids.has(id) && id !== resource.logicalId,
        );
        incoming.set(resource.logicalId, new Set(deps));
        for (const dep of deps) {
            const next = outgoing.get(dep) ?? [];
            next.push(resource.logicalId);
            outgoing.set(dep, next);
        }
    }

    const ready = resources
        .filter((resource) => (incoming.get(resource.logicalId)?.size ?? 0) === 0)
        .map((resource) => resource.logicalId)
        .sort((left, right) => (index.get(left) ?? 0) - (index.get(right) ?? 0));
    const ordered: StackResource[] = [];
    const seen = new Set<string>();

    while (ready.length > 0) {
        const id = ready.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const resource = resources.find((item) => item.logicalId === id);
        if (resource) ordered.push(resource);
        for (const child of outgoing.get(id) ?? []) {
            const deps = incoming.get(child);
            deps?.delete(id);
            if (deps && deps.size === 0) ready.push(child);
        }
        ready.sort((left, right) => (index.get(left) ?? 0) - (index.get(right) ?? 0));
    }

    for (const resource of resources) {
        if (!seen.has(resource.logicalId)) ordered.push(resource);
    }
    return ordered;
}

export function StackCreationLine({
    resources,
    parameters,
}: {
    resources: StackResource[];
    parameters: Record<string, unknown>;
}) {
    const t = useTranslations('automation');
    const s: StackText = t.stackCreation;
    const typeLabels = getTypeLabels(s);
    const ordered = orderStackResources(resources);
    if (ordered.length === 0) return null;

    return (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold">{s.title}</p>
            <ol className="space-y-0">
                {ordered.map((resource, position) => {
                    const creation = describe(s, resource.condition, parameters);
                    const previous = [...(resource.dependsOn ?? []), ...(resource.references ?? [])].filter(
                        (id, offset, list) => ordered.some((item) => item.logicalId === id) && list.indexOf(id) === offset,
                    );
                    const skipped = creation.included === false;
                    return (
                        <li key={resource.logicalId} className="relative flex gap-3 pb-3 last:pb-0">
                            {position < ordered.length - 1 && (
                                <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" />
                            )}
                            <span
                                className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                                    skipped ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'
                                }`}
                            >
                                {position + 1}
                            </span>
                            <div className={`min-w-0 ${skipped ? 'opacity-70' : ''}`}>
                                <p className="text-xs font-semibold">{typeLabels[resource.type] ?? resource.logicalId}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">
                                    {resource.logicalId} · {resource.type.replace('AWS::', '')}
                                </p>
                                <p className="mt-0.5 text-[11px] leading-snug">{creation.how}</p>
                                {previous.length > 0 && (
                                    <p className="text-[10px] text-muted-foreground">{s.after.replace('{items}', previous.join(', '))}</p>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
