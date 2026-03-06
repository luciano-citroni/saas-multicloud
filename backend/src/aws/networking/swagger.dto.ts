import { ApiProperty } from '@nestjs/swagger';

export class VpcResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',
        description: 'ID único da VPC no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC na AWS',
    })
    awsVpcId: string;

    @ApiProperty({
        example: '10.0.0.0/16',
        description: 'CIDR Block da VPC',
    })
    cidrBlock: string;

    @ApiProperty({
        example: 'available',
        description: 'Estado da VPC (available, pending)',
        enum: ['available', 'pending'],
    })
    state: string;

    @ApiProperty({
        example: false,
        description: 'Indica se é a VPC padrão da conta AWS',
    })
    isDefault: boolean;

    @ApiProperty({
        example: { Name: 'Production VPC', Environment: 'prod' },
        description: 'Tags da VPC (pares chave-valor)',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',
        description: 'Data e hora da última sincronização',
        nullable: true,
        format: 'date-time',
    })
    lastSyncedAt: Date | null;

    @ApiProperty({
        example: 2,
        description: 'Número de subnets associadas a esta VPC',
    })
    subnetsCount?: number;
}

export class SubnetResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174002',
        description: 'ID único da Subnet no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',
        description: 'ID da VPC no banco de dados',
    })
    vpcId: string;

    @ApiProperty({
        example: 'subnet-0a1b2c3d4e5f67890',
        description: 'ID da Subnet na AWS',
    })
    awsSubnetId: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC na AWS',
    })
    awsVpcId: string;

    @ApiProperty({
        example: '10.0.1.0/24',
        description: 'CIDR Block da Subnet',
    })
    cidrBlock: string;

    @ApiProperty({
        example: 'us-east-1a',
        description: 'Zona de disponibilidade',
    })
    availabilityZone: string;

    @ApiProperty({
        example: 251,
        description: 'Número de IPs disponíveis nesta subnet',
    })
    availableIpAddressCount: number;

    @ApiProperty({
        example: 'available',
        description: 'Estado da Subnet',
        enum: ['available', 'pending'],
    })
    state: string;

    @ApiProperty({
        example: false,
        description: 'Indica se é a subnet padrão da zona de disponibilidade',
    })
    isDefaultForAz: boolean;

    @ApiProperty({
        example: true,
        description: 'Indica se instâncias lançadas nesta subnet recebem IP público automaticamente',
    })
    mapPublicIpOnLaunch: boolean;

    @ApiProperty({
        example: 'public',
        description: 'Tipo da subnet baseado na route table: public (com Internet Gateway), private_with_nat (com NAT Gateway) ou private_isolated (sem acesso à internet)',
        enum: ['public', 'private_with_nat', 'private_isolated'],
    })
    subnetType: string;

    @ApiProperty({
        example: { Name: 'Production Subnet', Tier: 'public' },
        description: 'Tags da Subnet (pares chave-valor)',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: '2026-03-04T10:15:30Z',
        description: 'Data e hora da última sincronização',
        nullable: true,
        format: 'date-time',
    })
    lastSyncedAt: Date | null;
}

export class VpcWithSubnetsResponseDto {
    @ApiProperty({ type: VpcResponseDto })
    vpc: VpcResponseDto;

    @ApiProperty({
        type: [SubnetResponseDto],
        description: 'Array de subnets associadas à VPC',
    })
    subnets: SubnetResponseDto[];
}

export class VpcSyncResponseDto {
    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC na AWS',
    })
    vpcId: string;

    @ApiProperty({
        example: '10.0.0.0/16',
        description: 'CIDR Block da VPC',
    })
    cidrBlock: string;

    @ApiProperty({
        example: 'available',
        description: 'Estado da VPC',
    })
    state: string;

    @ApiProperty({
        example: false,
        description: 'Indica se é a VPC padrão',
    })
    isDefault: boolean;

    @ApiProperty({
        example: { Name: 'Production VPC', Environment: 'prod' },
        description: 'Tags da VPC',
    })
    tags: Record<string, string>;
}

export class SubnetSyncResponseDto {
    @ApiProperty({
        example: 'subnet-0a1b2c3d4e5f67890',
        description: 'ID da Subnet na AWS',
    })
    subnetId: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC na AWS',
    })
    vpcId: string;

    @ApiProperty({
        example: '10.0.1.0/24',
        description: 'CIDR Block da Subnet',
    })
    cidrBlock: string;

    @ApiProperty({
        example: 'us-east-1a',
        description: 'Zona de disponibilidade',
    })
    availabilityZone: string;

    @ApiProperty({
        example: 251,
        description: 'Número de IPs disponíveis',
    })
    availableIpAddressCount: number;

    @ApiProperty({
        example: 'available',
        description: 'Estado da Subnet',
    })
    state: string;

    @ApiProperty({
        example: false,
        description: 'Indica se é subnet padrão para a AZ',
    })
    isDefaultForAz: boolean;

    @ApiProperty({
        example: true,
        description: 'Indica se lança IP público',
    })
    mapPublicIpOnLaunch: boolean;

    @ApiProperty({
        example: { Name: 'Production Subnet', Tier: 'public' },
        description: 'Tags da Subnet',
    })
    tags: Record<string, string>;
}
