'use client';

export type StackResource = {
    logicalId: string;
    type: string;
    dependsOn?: string[];
    references?: string[];
    condition?: string;
};

const TYPE_LABELS: Record<string, string> = {
    'AWS::ECS::Cluster': 'Cluster ECS',
    'AWS::ECS::Service': 'Serviço ECS',
    'AWS::ECS::TaskDefinition': 'Task definition',
    'AWS::ECR::Repository': 'Repositório ECR',
    'AWS::IAM::Role': 'Role IAM',
    'AWS::IAM::Policy': 'Política IAM',
    'AWS::Logs::LogGroup': 'Grupo de logs',
    'AWS::EC2::VPC': 'VPC',
    'AWS::EC2::Subnet': 'Subnet',
    'AWS::EC2::RouteTable': 'Tabela de rota',
    'AWS::EC2::NatGateway': 'NAT Gateway',
    'AWS::EC2::Instance': 'Instância EC2',
    'AWS::EC2::SecurityGroup': 'Security group',
    'AWS::EC2::SecurityGroupIngress': 'Regra de entrada',
    'AWS::ElasticLoadBalancingV2::LoadBalancer': 'Load balancer',
    'AWS::ElasticLoadBalancingV2::TargetGroup': 'Target group',
    'AWS::ElasticLoadBalancingV2::Listener': 'Listener',
    'AWS::S3::Bucket': 'Bucket S3',
    'AWS::Lambda::Function': 'Função Lambda',
    'AWS::RDS::DBInstance': 'Instância RDS',
    'AWS::ApiGateway::RestApi': 'API Gateway',
    'AWS::Amplify::App': 'App Amplify',
    'AWS::CloudFront::Distribution': 'CloudFront',
};

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

function describe(condition: string | undefined, parameters: Record<string, unknown>): Creation {
    if (!condition) return { included: true, how: 'Criado direto no stack, sem condição.' };

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
                ? { included: null, how: 'Cria o cluster quando o nome existente fica vazio.' }
                : cluster
                  ? { included: true, how: 'Cria um cluster ECS novo com o nome da aplicação.' }
                  : { included: false, how: 'Não cria. Usa o cluster já informado.' },
        CreateRepository: () =>
            repository === null
                ? { included: null, how: 'Cria o repositório quando a URI existente fica vazia.' }
                : repository
                  ? { included: true, how: 'Cria um repositório ECR novo.' }
                  : { included: false, how: 'Não cria. Usa o repositório já informado.' },
        CreateExecutionRole: () =>
            executionRole === null
                ? { included: null, how: 'Cria a role de execução quando o ARN fica vazio.' }
                : executionRole
                  ? { included: true, how: 'Cria a role de execução da task.' }
                  : { included: false, how: 'Não cria. Usa a role de execução informada.' },
        CreateTaskRole: () =>
            taskRole === null
                ? { included: null, how: 'Cria a role da task quando o ARN fica vazio.' }
                : taskRole
                  ? { included: true, how: 'Cria a role da task.' }
                  : { included: false, how: 'Não cria. Usa a role da task informada.' },
        HasSecret: () =>
            secret === null
                ? { included: null, how: 'Entra no stack quando um segredo é informado.' }
                : secret
                  ? { included: false, how: 'Não cria. Nenhum segredo foi informado.' }
                  : { included: true, how: 'Usa o segredo informado na task.' },
        GrantSecretToNewRole: () => {
            if (executionRole === null || secret === null) {
                return { included: null, how: 'Cria a política quando há segredo e a role de execução é nova.' };
            }
            if (executionRole && !secret) return { included: true, how: 'Cria a política para a role nova ler o segredo.' };
            return { included: false, how: 'Não cria a política de leitura do segredo.' };
        },
        UseLoadBalancer: () =>
            loadBalancer === null
                ? { included: null, how: 'Criado quando o load balancer está habilitado.' }
                : loadBalancer
                  ? { included: true, how: 'Cria o recurso do load balancer.' }
                  : { included: false, how: 'Não cria. O load balancer está desligado.' },
        SkipLoadBalancer: () =>
            loadBalancer === null
                ? { included: null, how: 'Criado só quando o load balancer está desligado.' }
                : loadBalancer
                  ? { included: false, how: 'Não cria. O tráfego entra pelo load balancer.' }
                  : { included: true, how: 'Abre a porta do serviço direto, sem load balancer.' },
        UseHttps: () => {
            if (loadBalancer === null || certificate === null) {
                return { included: null, how: 'Criado quando há load balancer e certificado ACM.' };
            }
            if (loadBalancer && !certificate) return { included: true, how: 'Publica HTTPS e redireciona o HTTP.' };
            return { included: false, how: 'Não cria o listener HTTPS.' };
        },
        UseHttpOnly: () => {
            if (loadBalancer === null || certificate === null) {
                return { included: null, how: 'Criado quando há load balancer e nenhum certificado.' };
            }
            if (loadBalancer && certificate) return { included: true, how: 'Publica só HTTP e encaminha para o target group.' };
            return { included: false, how: 'Não cria o listener só HTTP.' };
        },
    };

    return rules[condition]?.() ?? { included: null, how: `Criado quando a condição ${condition} é verdadeira.` };
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
    const ordered = orderStackResources(resources);
    if (ordered.length === 0) return null;

    return (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold">Ordem de criação</p>
            <ol className="space-y-0">
                {ordered.map((resource, position) => {
                    const creation = describe(resource.condition, parameters);
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
                                <p className="text-xs font-semibold">{TYPE_LABELS[resource.type] ?? resource.logicalId}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">
                                    {resource.logicalId} · {resource.type.replace('AWS::', '')}
                                </p>
                                <p className="mt-0.5 text-[11px] leading-snug">{creation.how}</p>
                                {previous.length > 0 && (
                                    <p className="text-[10px] text-muted-foreground">Depois de {previous.join(', ')}</p>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
