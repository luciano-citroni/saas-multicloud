import { ApiProperty } from '@nestjs/swagger';

export class LoadBalancerListenerDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174005',
        description: 'ID único do listener no banco de dados',
    })
    id!: string;

    @ApiProperty({
        example: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/my-load-balancer/50dc6c495c0c9188/f2f7dc8efc522ab2',
        description: 'ARN do listener na AWS',
    })
    awsListenerArn!: string;

    @ApiProperty({
        example: 443,
        description: 'Porta do listener',
    })
    port!: number;

    @ApiProperty({
        example: 'HTTPS',
        description: 'Protocolo do listener',
        enum: ['HTTP', 'HTTPS', 'TCP', 'TLS', 'UDP', 'TCP_UDP'],
    })
    protocol!: string;

    @ApiProperty({
        example: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
        description: 'ARN do certificado SSL/TLS',
        nullable: true,
    })
    sslCertificateArn!: string | null;

    @ApiProperty({
        example: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
        description: 'Política SSL',
        nullable: true,
    })
    sslPolicy!: string | null;

    @ApiProperty({
        example: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/50dc6c495c0c9188',
        description: 'ARN do Target Group padrão',
        nullable: true,
    })
    defaultTargetGroupArn!: string | null;

    @ApiProperty({
        example: [{ Type: 'forward', TargetGroupArn: 'arn:aws:...' }],
        description: 'Ações padrão do listener',
        type: 'array',
    })
    defaultActions!: Record<string, any>[];
}

export class LoadBalancerSubnetDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174006',
        description: 'ID da subnet no banco de dados',
    })
    id!: string;

    @ApiProperty({
        example: 'subnet-0a1b2c3d4e5f67890',
        description: 'ID da subnet na AWS',
    })
    awsSubnetId!: string;

    @ApiProperty({
        example: 'us-east-1a',
        description: 'Availability Zone',
    })
    availabilityZone!: string;

    @ApiProperty({
        example: '10.0.1.0/24',
        description: 'Bloco CIDR da subnet',
    })
    cidrBlock!: string;

    @ApiProperty({
        example: 'public',
        description: 'Tipo da subnet',
        enum: ['public', 'private_with_nat', 'private_isolated'],
    })
    subnetType!: string;
}

export class LoadBalancerResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',
        description: 'ID único do Load Balancer no banco de dados (UUID)',
    })
    id!: string;

    @ApiProperty({
        example: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-load-balancer/50dc6c495c0c9188',
        description: 'ARN do Load Balancer na AWS',
    })
    awsLoadBalancerArn!: string;

    @ApiProperty({
        example: 'my-load-balancer',
        description: 'Nome do Load Balancer',
    })
    name!: string;

    @ApiProperty({
        example: 'my-load-balancer-1234567890.us-east-1.elb.amazonaws.com',
        description: 'DNS name do Load Balancer',
    })
    dnsName!: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',
        description: 'ID da VPC no banco de dados',
        nullable: true,
    })
    vpcId!: string | null;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'VPC ID na AWS',
        nullable: true,
    })
    awsVpcId!: string | null;

    @ApiProperty({
        example: 'application',
        description: 'Tipo do Load Balancer',
        enum: ['application', 'network', 'gateway', 'classic'],
    })
    type!: string;

    @ApiProperty({
        example: 'active',
        description: 'Estado do Load Balancer',
        enum: ['provisioning', 'active', 'active_impaired', 'failed'],
    })
    state!: string;

    @ApiProperty({
        example: 'internet-facing',
        description: 'Esquema do Load Balancer (internet-facing ou internal)',
    })
    scheme!: string;

    @ApiProperty({
        example: 'ipv4',
        description: 'Tipo de endereço IP',
        enum: ['ipv4', 'dualstack'],
    })
    ipAddressType!: string;

    @ApiProperty({
        example: [
            {
                zoneName: 'us-east-1a',
                subnetId: 'subnet-12345678',
                loadBalancerAddresses: [],
            },
        ],
        description: 'Availability Zones onde o Load Balancer está disponível',
        nullable: true,
        type: 'array',
    })
    availabilityZones!: Record<string, any>[] | null;

    @ApiProperty({
        example: ['sg-12345678'],
        description: 'IDs dos Security Groups associados',
        nullable: true,
        type: [String],
    })
    securityGroups!: string[] | null;

    @ApiProperty({
        example: '2023-01-15T10:30:00Z',
        description: 'Data de criação do Load Balancer na AWS',
        nullable: true,
    })
    createdTime!: Date | null;

    @ApiProperty({
        example: { Name: 'Production LB', Environment: 'production' },
        description: 'Tags do Load Balancer',
    })
    tags!: Record<string, string>;

    @ApiProperty({
        example: '2024-03-06T14:30:00Z',
        description: 'Timestamp da última sincronização com AWS',
        nullable: true,
    })
    lastSyncedAt!: Date | null;

    @ApiProperty({
        example: '2024-01-15T10:00:00Z',
        description: 'Data de criação no banco de dados',
    })
    createdAt!: Date;

    @ApiProperty({
        example: '2024-03-06T14:30:00Z',
        description: 'Data da última atualização no banco de dados',
    })
    updatedAt!: Date;

    @ApiProperty({
        description: 'Listeners configurados neste Load Balancer',
        type: [LoadBalancerListenerDto],
    })
    listeners!: LoadBalancerListenerDto[];

    @ApiProperty({
        description: 'Subnets associadas a este Load Balancer',
        type: [LoadBalancerSubnetDto],
    })
    subnets!: LoadBalancerSubnetDto[];
}

export class LoadBalancerSyncResponseDto {
    @ApiProperty({
        example: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-load-balancer/50dc6c495c0c9188',
        description: 'ARN do Load Balancer na AWS',
    })
    awsLoadBalancerArn!: string;

    @ApiProperty({
        example: 'my-load-balancer',
        description: 'Nome do Load Balancer',
    })
    name!: string;

    @ApiProperty({
        example: 'my-load-balancer-1234567890.us-east-1.elb.amazonaws.com',
        description: 'DNS name do Load Balancer',
    })
    dnsName!: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'VPC ID na AWS',
        nullable: true,
    })
    awsVpcId!: string | null;

    @ApiProperty({
        example: 'application',
        description: 'Tipo do Load Balancer',
        enum: ['application', 'network', 'gateway', 'classic'],
    })
    type!: string;

    @ApiProperty({
        example: 'active',
        description: 'Estado do Load Balancer',
        enum: ['provisioning', 'active', 'active_impaired', 'failed'],
    })
    state!: string;

    @ApiProperty({
        example: 'internet-facing',
        description: 'Esquema do Load Balancer',
    })
    scheme!: string;

    @ApiProperty({
        example: 'ipv4',
        description: 'Tipo de endereço IP',
        enum: ['ipv4', 'dualstack'],
    })
    ipAddressType!: string;

    @ApiProperty({
        example: [
            {
                zoneName: 'us-east-1a',
                subnetId: 'subnet-12345678',
                loadBalancerAddresses: [],
            },
        ],
        description: 'Availability Zones',
        nullable: true,
        type: 'array',
    })
    availabilityZones!: Record<string, any>[] | null;

    @ApiProperty({
        example: ['sg-12345678'],
        description: 'Security Groups',
        nullable: true,
        type: [String],
    })
    securityGroups!: string[] | null;

    @ApiProperty({
        example: '2023-01-15T10:30:00Z',
        description: 'Data de criação na AWS',
        nullable: true,
    })
    createdTime!: Date | null;

    @ApiProperty({
        example: null,
        description: 'Tags (sincronização futura)',
        nullable: true,
    })
    tags!: Record<string, string> | null;
}
