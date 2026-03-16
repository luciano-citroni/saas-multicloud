import { ApiProperty } from '@nestjs/swagger';

export class Ec2InstanceResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',

        description: 'ID único da instância no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'i-0a1b2c3d4e5f67890',

        description: 'ID da instância na AWS',
    })
    awsInstanceId: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',

        description: 'ID da VPC no banco de dados',

        nullable: true,
    })
    vpcId: string | null;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174002',

        description: 'ID da Subnet no banco de dados',

        nullable: true,
    })
    subnetId: string | null;

    @ApiProperty({
        example: 't2.micro',

        description: 'Tipo de instância (t2.micro, t2.small, m5.large, etc.)',
    })
    instanceType: string;

    @ApiProperty({
        example: 'running',

        description: 'Estado da instância',

        enum: ['running', 'stopped', 'stopping', 'starting', 'terminated', 'terminating', 'pending'],
    })
    state: string;

    @ApiProperty({
        example: '10.0.1.100',

        description: 'IP privado da instância',
    })
    privateIpAddress: string;

    @ApiProperty({
        example: '54.123.45.67',

        description: 'IP público atribuído à instância',

        nullable: true,
    })
    publicIpAddress: string | null;

    @ApiProperty({
        example: '52.123.45.67',

        description: 'IP Elástico associado à instância',

        nullable: true,
    })
    elasticIp: string | null;

    @ApiProperty({
        example: 'my-keypair',

        description: 'Chave de par utilizada para a instância',

        nullable: true,
    })
    keyName: string | null;

    @ApiProperty({
        example: 'sg-0a1b2c3d4e5f67890',

        description: 'ID do grupo de segurança primário',

        nullable: true,
    })
    securityGroupId: string | null;

    @ApiProperty({
        example: { Name: 'WebServer', Environment: 'prod' },

        description: 'Tags da instância (pares chave-valor)',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: '2026-03-04T09:30:00Z',

        description: 'Data e hora em que a instância foi lançada',

        nullable: true,

        format: 'date-time',
    })
    launchTime: Date | null;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',

        description: 'Data e hora da última sincronização',

        nullable: true,

        format: 'date-time',
    })
    lastSyncedAt: Date | null;
}

export class Ec2SyncResponseDto {
    @ApiProperty({
        example: 'i-0a1b2c3d4e5f67890',

        description: 'ID da instância na AWS',
    })
    awsInstanceId: string;

    @ApiProperty({
        example: 't2.micro',

        description: 'Tipo de instância',
    })
    instanceType: string;

    @ApiProperty({
        example: 'running',

        description: 'Estado da instância',
    })
    state: string;

    @ApiProperty({
        example: '10.0.1.100',

        description: 'IP privado',
    })
    privateIpAddress: string;

    @ApiProperty({
        example: '54.123.45.67',

        description: 'IP público',

        nullable: true,
    })
    publicIpAddress: string | null;

    @ApiProperty({
        example: { Name: 'WebServer', Environment: 'prod' },

        description: 'Tags da instância',
    })
    tags: Record<string, string>;
}

export class Ec2WithRelationsResponseDto extends Ec2InstanceResponseDto {
    @ApiProperty({
        example: {
            id: '123e4567-e89b-12d3-a456-426614174001',

            awsVpcId: 'vpc-0a1b2c3d4e5f67890',

            cidrBlock: '10.0.0.0/16',

            state: 'available',
        },

        description: 'VPC à qual a instância está associada',

        nullable: true,
    })
    vpc?: {
        id: string;

        awsVpcId: string;

        cidrBlock: string;

        state: string;
    } | null;

    @ApiProperty({
        example: {
            id: '123e4567-e89b-12d3-a456-426614174002',

            awsSubnetId: 'subnet-0a1b2c3d4e5f67890',

            cidrBlock: '10.0.1.0/24',

            availabilityZone: 'us-east-1a',
        },

        description: 'Subnet à qual a instância está associada',

        nullable: true,
    })
    subnet?: {
        id: string;

        awsSubnetId: string;

        cidrBlock: string;

        availabilityZone: string;
    } | null;
}
