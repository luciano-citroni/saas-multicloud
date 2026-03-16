import { ApiProperty } from '@nestjs/swagger';

// =========================================================================

// Clusters ECS

// =========================================================================

export class EcsClusterResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',

        description: 'ID único do cluster no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID da conta cloud',
    })
    cloudAccountId: string;

    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster',

        description: 'ARN do cluster na AWS',
    })
    clusterArn: string;

    @ApiProperty({
        example: 'my-cluster',

        description: 'Nome do cluster',
    })
    clusterName: string;

    @ApiProperty({
        example: 'ACTIVE',

        description: 'Status do cluster',

        enum: ['ACTIVE', 'PROVISIONING', 'DEPROVISIONING', 'FAILED', 'INACTIVE'],
    })
    status: string;

    @ApiProperty({
        example: 3,

        description: 'Número de instâncias de container registradas',
    })
    registeredContainerInstancesCount: number;

    @ApiProperty({
        example: 5,

        description: 'Número de tasks em execução',
    })
    runningTasksCount: number;

    @ApiProperty({
        example: 1,

        description: 'Número de tasks pendentes',
    })
    pendingTasksCount: number;

    @ApiProperty({
        example: 2,

        description: 'Número de serviços ativos',
    })
    activeServicesCount: number;

    @ApiProperty({
        example: { Name: 'production', Environment: 'prod' },

        description: 'Tags do cluster',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: ['FARGATE', 'FARGATE_SPOT'],

        description: 'Provedores de capacidade',

        nullable: true,
    })
    capacityProviders: string[] | null;

    @ApiProperty({
        example: [{ capacityProvider: 'FARGATE', weight: 1, base: 0 }],

        description: 'Estratégia padrão de provisionamento de capacidade',

        nullable: true,
    })
    defaultCapacityProviderStrategy: Record<string, any>[] | null;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',

        description: 'Data e hora da última sincronização',

        nullable: true,

        format: 'date-time',
    })
    lastSyncedAt: Date | null;

    @ApiProperty({
        example: '2026-03-04T09:00:00Z',

        description: 'Data de criação no banco de dados',

        format: 'date-time',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',

        description: 'Data de última atualização no banco de dados',

        format: 'date-time',
    })
    updatedAt: Date;
}

export class EcsClusterSyncResponseDto {
    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster',

        description: 'ARN do cluster na AWS',
    })
    clusterArn: string;

    @ApiProperty({
        example: 'my-cluster',

        description: 'Nome do cluster',
    })
    clusterName: string;

    @ApiProperty({
        example: 'ACTIVE',

        description: 'Status do cluster',
    })
    status: string;

    @ApiProperty({
        example: 3,

        description: 'Número de instâncias de container registradas',
    })
    registeredContainerInstancesCount: number;

    @ApiProperty({
        example: 5,

        description: 'Número de tasks em execução',
    })
    runningTasksCount: number;

    @ApiProperty({
        example: 1,

        description: 'Número de tasks pendentes',
    })
    pendingTasksCount: number;

    @ApiProperty({
        example: 2,

        description: 'Número de serviços ativos',
    })
    activeServicesCount: number;

    @ApiProperty({
        example: { Name: 'production' },

        description: 'Tags do cluster',
    })
    tags: Record<string, string>;
}

// =========================================================================

// Task Definitions ECS

// =========================================================================

export class EcsTaskDefinitionResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174004',

        description: 'ID único da task definition no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID da conta cloud',
    })
    cloudAccountId: string;

    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:1',

        description: 'ARN da task definition na AWS',
    })
    taskDefinitionArn: string;

    @ApiProperty({
        example: 'my-app',

        description: 'Família da task definition',
    })
    family: string;

    @ApiProperty({
        example: 1,

        description: 'Revisão da task definition',
    })
    revision: number;

    @ApiProperty({
        example: 'ACTIVE',

        description: 'Status da task definition',

        enum: ['ACTIVE', 'INACTIVE', 'DELETE_IN_PROGRESS'],
    })
    status: string;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole',

        description: 'ARN da role de execução',

        nullable: true,
    })
    executionRoleArn: string | null;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:role/ecsTaskRole',

        description: 'ARN da role da task',

        nullable: true,
    })
    taskRoleArn: string | null;

    @ApiProperty({
        example: 'awsvpc',

        description: 'Modo de rede',

        nullable: true,
    })
    networkMode: string | null;

    @ApiProperty({
        example: '256',

        description: 'CPU necessária (em unidades)',

        nullable: true,
    })
    cpu: string | null;

    @ApiProperty({
        example: '512',

        description: 'Memória necessária (em MB)',

        nullable: true,
    })
    memory: string | null;

    @ApiProperty({
        example: ['FARGATE'],

        description: 'Tipos de compatibilidade',
    })
    requiresCompatibilities: string[];

    @ApiProperty({
        example: [
            {
                name: 'my-container',

                image: 'nginx:latest',

                cpu: 256,

                memory: 512,

                essential: true,

                portMappings: [{ containerPort: 80, protocol: 'tcp' }],
            },
        ],

        description: 'Definições dos containers',
    })
    containerDefinitions: Record<string, any>[];

    @ApiProperty({
        example: [{ name: 'my-volume', host: {} }],

        description: 'Definições de volumes',

        nullable: true,
    })
    volumes: Record<string, any>[] | null;

    @ApiProperty({
        example: { Name: 'app', Version: 'v1' },

        description: 'Tags da task definition',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: '2026-03-04T09:30:00Z',

        description: 'Data de registro na AWS',

        nullable: true,

        format: 'date-time',
    })
    registeredAt: Date | null;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:user/admin',

        description: 'Usuário que registrou a task definition',

        nullable: true,
    })
    registeredBy: string | null;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',

        description: 'Data e hora da última sincronização',

        nullable: true,

        format: 'date-time',
    })
    lastSyncedAt: Date | null;
}

export class EcsTaskDefinitionSyncResponseDto {
    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:1',

        description: 'ARN da task definition na AWS',
    })
    taskDefinitionArn: string;

    @ApiProperty({
        example: 'my-app',

        description: 'Família da task definition',
    })
    family: string;

    @ApiProperty({
        example: 1,

        description: 'Revisão da task definition',
    })
    revision: number;

    @ApiProperty({
        example: 'ACTIVE',

        description: 'Status da task definition',
    })
    status: string;

    @ApiProperty({
        example: ['FARGATE'],

        description: 'Tipos de compatibilidade',
    })
    requiresCompatibilities: string[];

    @ApiProperty({
        example: '256',

        description: 'CPU necessária',

        nullable: true,
    })
    cpu: string | null;

    @ApiProperty({
        example: '512',

        description: 'Memória necessária',

        nullable: true,
    })
    memory: string | null;
}

// =========================================================================

// Serviços ECS

// =========================================================================

export class EcsServiceResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174005',

        description: 'ID único do serviço no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID da conta cloud',
    })
    cloudAccountId: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',

        description: 'ID do cluster',
    })
    clusterId: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174004',

        description: 'ID da task definition',
    })
    taskDefinitionId: string;

    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:service/my-cluster/my-service',

        description: 'ARN do serviço na AWS',
    })
    serviceArn: string;

    @ApiProperty({
        example: 'my-service',

        description: 'Nome do serviço',
    })
    serviceName: string;

    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:cluster/my-cluster',

        description: 'ARN do cluster',
    })
    clusterArn: string;

    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:1',

        description: 'ARN da task definition',
    })
    taskDefinitionArn: string;

    @ApiProperty({
        example: 'ACTIVE',

        description: 'Status do serviço',

        enum: ['ACTIVE', 'DRAINING', 'INACTIVE'],
    })
    status: string;

    @ApiProperty({
        example: 2,

        description: 'Número desejado de tasks',
    })
    desiredCount: number;

    @ApiProperty({
        example: 2,

        description: 'Número de tasks em execução',
    })
    runningCount: number;

    @ApiProperty({
        example: 0,

        description: 'Número de tasks pendentes',
    })
    pendingCount: number;

    @ApiProperty({
        example: 'FARGATE',

        description: 'Tipo de lançamento',

        nullable: true,
    })
    launchType: string | null;

    @ApiProperty({
        example: '1.4.0',

        description: 'Versão da plataforma',

        nullable: true,
    })
    platformVersion: string | null;

    @ApiProperty({
        example: 'LINUX',

        description: 'Família da plataforma',

        nullable: true,
    })
    platformFamily: string | null;

    @ApiProperty({
        example: {
            awsvpcConfiguration: {
                subnets: ['subnet-12345'],

                securityGroups: ['sg-12345'],

                assignPublicIp: 'ENABLED',
            },
        },

        description: 'Configuração de rede',

        nullable: true,
    })
    networkConfiguration: Record<string, any> | null;

    @ApiProperty({
        example: [
            {
                targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/abc123',

                containerName: 'my-container',

                containerPort: 80,
            },
        ],

        description: 'Load balancers associados',

        nullable: true,
    })
    loadBalancers: Record<string, any>[] | null;

    @ApiProperty({
        example: true,

        description: 'Circuit breaker habilitado',
    })
    enableCircuitBreaker: boolean;

    @ApiProperty({
        example: { Name: 'web-service', Environment: 'production' },

        description: 'Tags do serviço',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: '2026-03-04T09:30:00Z',

        description: 'Data de criação na AWS',

        nullable: true,

        format: 'date-time',
    })
    createdAtAws: Date | null;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',

        description: 'Data e hora da última sincronização',

        nullable: true,

        format: 'date-time',
    })
    lastSyncedAt: Date | null;

    @ApiProperty({
        description: 'Detalhes do cluster',

        type: EcsClusterResponseDto,

        required: false,
    })
    cluster?: EcsClusterResponseDto;

    @ApiProperty({
        description: 'Detalhes da task definition',

        type: EcsTaskDefinitionResponseDto,

        required: false,
    })
    taskDefinition?: EcsTaskDefinitionResponseDto;
}

export class EcsServiceSyncResponseDto {
    @ApiProperty({
        example: 'arn:aws:ecs:us-east-1:123456789012:service/my-cluster/my-service',

        description: 'ARN do serviço na AWS',
    })
    serviceArn: string;

    @ApiProperty({
        example: 'my-service',

        description: 'Nome do serviço',
    })
    serviceName: string;

    @ApiProperty({
        example: 'ACTIVE',

        description: 'Status do serviço',
    })
    status: string;

    @ApiProperty({
        example: 2,

        description: 'Número desejado de tasks',
    })
    desiredCount: number;

    @ApiProperty({
        example: 2,

        description: 'Número de tasks em execução',
    })
    runningCount: number;

    @ApiProperty({
        example: 0,

        description: 'Número de tasks pendentes',
    })
    pendingCount: number;

    @ApiProperty({
        example: 'FARGATE',

        description: 'Tipo de lançamento',

        nullable: true,
    })
    launchType: string | null;
}
