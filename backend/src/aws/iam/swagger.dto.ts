import { ApiProperty } from '@nestjs/swagger';

export class IamRoleAttachedPolicyDto {
    @ApiProperty({
        example: 'AmazonECSTaskExecutionRolePolicy',

        description: 'Nome da política gerenciada',
    })
    policyName!: string;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:policy/MyAppPolicy',

        description: 'ARN da política gerenciada (customer-managed da conta)',
    })
    policyArn!: string;
}

export class IamRoleLastUsedDto {
    @ApiProperty({
        example: '2026-03-01T10:00:00Z',

        description: 'Data da última utilização da role',

        nullable: true,

        format: 'date-time',
    })
    lastUsedDate!: Date | null;

    @ApiProperty({
        example: 'us-east-1',

        description: 'Região onde a role foi utilizada por último',

        nullable: true,
    })
    region!: string | null;
}

export class IamRoleResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174010',

        description: 'ID único da role no banco de dados (UUID)',
    })
    id!: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID da conta cloud',
    })
    cloudAccountId!: string;

    @ApiProperty({
        example: 'AROAI3UMHVBPQEXAMPLE',

        description: 'ID único estável da role na AWS',
    })
    awsRoleId!: string;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:role/MyRole',

        description: 'ARN da role IAM',
    })
    roleArn!: string;

    @ApiProperty({
        example: 'MyRole',

        description: 'Nome da role IAM',
    })
    roleName!: string;

    @ApiProperty({
        example: '/',

        description: 'Caminho da role (ex: /, /service-role/)',
    })
    path!: string;

    @ApiProperty({
        example: 'Role para execução de tasks ECS',

        description: 'Descrição da role',

        nullable: true,
    })
    description!: string | null;

    @ApiProperty({
        example: {
            Version: '2012-10-17',

            Statement: [
                {
                    Effect: 'Allow',

                    Principal: { Service: 'ecs-tasks.amazonaws.com' },

                    Action: 'sts:AssumeRole',
                },
            ],
        },

        description: 'Política de confiança (trust policy) da role',

        nullable: true,
    })
    assumeRolePolicyDocument!: Record<string, any> | null;

    @ApiProperty({
        example: 3600,

        description: 'Duração máxima da sessão em segundos',
    })
    maxSessionDuration!: number;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:policy/MyBoundary',

        description: 'ARN do permissions boundary aplicado à role',

        nullable: true,
    })
    permissionsBoundaryArn!: string | null;

    @ApiProperty({
        description: 'Políticas gerenciadas anexadas à role',

        type: [IamRoleAttachedPolicyDto],

        nullable: true,
    })
    attachedPolicies!: IamRoleAttachedPolicyDto[] | null;

    @ApiProperty({
        example: ['MyInlinePolicy'],

        description: 'Nomes das políticas inline da role',

        nullable: true,

        type: [String],
    })
    inlinePolicyNames!: string[] | null;

    @ApiProperty({
        description: 'Última utilização da role',

        type: IamRoleLastUsedDto,

        nullable: true,
    })
    roleLastUsed!: IamRoleLastUsedDto | null;

    @ApiProperty({
        example: '2023-01-15T10:30:00Z',

        description: 'Data de criação da role na AWS',

        nullable: true,

        format: 'date-time',
    })
    createdDateAws!: Date | null;

    @ApiProperty({
        example: { Name: 'ecs-execution-role', Environment: 'production' },

        description: 'Tags da role',
    })
    tags!: Record<string, string>;

    @ApiProperty({
        example: '2026-03-07T10:00:00Z',

        description: 'Timestamp da última sincronização com AWS',

        nullable: true,

        format: 'date-time',
    })
    lastSyncedAt!: Date | null;

    @ApiProperty({
        example: '2026-03-07T09:00:00Z',

        description: 'Data de criação no banco de dados',

        format: 'date-time',
    })
    createdAt!: Date;

    @ApiProperty({
        example: '2026-03-07T10:00:00Z',

        description: 'Data da última atualização no banco de dados',

        format: 'date-time',
    })
    updatedAt!: Date;
}

export class IamRoleSyncResponseDto {
    @ApiProperty({
        example: 'AROAI3UMHVBPQEXAMPLE',

        description: 'ID único estável da role na AWS',
    })
    awsRoleId!: string;

    @ApiProperty({
        example: 'arn:aws:iam::123456789012:role/MyRole',

        description: 'ARN da role IAM',
    })
    roleArn!: string;

    @ApiProperty({
        example: 'MyRole',

        description: 'Nome da role IAM',
    })
    roleName!: string;

    @ApiProperty({
        example: '/',

        description: 'Caminho da role',
    })
    path!: string;

    @ApiProperty({
        example: 'Role para execução de tasks ECS',

        description: 'Descrição da role',

        nullable: true,
    })
    description!: string | null;

    @ApiProperty({
        example: 3600,

        description: 'Duração máxima da sessão em segundos',
    })
    maxSessionDuration!: number;

    @ApiProperty({
        description: 'Políticas gerenciadas anexadas à role',

        type: [IamRoleAttachedPolicyDto],

        nullable: true,
    })
    attachedPolicies!: IamRoleAttachedPolicyDto[] | null;

    @ApiProperty({
        example: '2023-01-15T10:30:00Z',

        description: 'Data de criação da role na AWS',

        nullable: true,
    })
    createdDateAws!: Date | null;
}
