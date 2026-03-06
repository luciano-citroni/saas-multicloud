import { ApiProperty } from '@nestjs/swagger';

export class RouteDto {
    @ApiProperty({ example: '0.0.0.0/0', description: 'CIDR de destino da rota' })
    destinationCidr!: string;

    @ApiProperty({ example: 'igw-0a1b2c3d', description: 'Alvo da rota (IGW, NAT, etc)' })
    target!: string;

    @ApiProperty({ example: 'gateway', description: 'Tipo do alvo (gateway, nat-gateway, instance, etc)' })
    targetType!: string;

    @ApiProperty({ example: 'active', description: 'Estado da rota' })
    state!: string;
}

export class RouteTableAssociationDto {
    @ApiProperty({ example: 'subnet-0a1b2c3d', description: 'ID da subnet na AWS' })
    subnetId!: string;

    @ApiProperty({ example: 'rtbassoc-0a1b2c3d', description: 'ID da associação na AWS' })
    associationId!: string;

    @ApiProperty({ example: false, description: 'Se é a associação principal da VPC' })
    isMain!: boolean;
}

export class RouteTableResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'UUID da Route Table no banco de dados' })
    id!: string;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'UUID da VPC no banco de dados' })
    vpcId!: string;

    @ApiProperty({ example: 'rtb-0a1b2c3d4e5f67890', description: 'Route Table ID na AWS' })
    awsRouteTableId!: string;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', description: 'VPC ID na AWS' })
    awsVpcId!: string;

    @ApiProperty({ example: false, description: 'Se é a route table principal da VPC' })
    isMain!: boolean;

    @ApiProperty({ type: [RouteDto], description: 'Rotas da route table' })
    routes!: RouteDto[];

    @ApiProperty({ type: [RouteTableAssociationDto], description: 'Associações da route table com subnets' })
    associations!: RouteTableAssociationDto[];

    @ApiProperty({ example: { Name: 'prod-public-rt', Environment: 'production' }, description: 'Tags da Route Table' })
    tags!: Record<string, string>;

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z', description: 'Timestamp da última sincronização' })
    lastSyncedAt!: Date | null;
}

export class RouteTableSyncResponseDto {
    @ApiProperty({ example: 'rtb-0a1b2c3d4e5f67890', description: 'Route Table ID na AWS' })
    routeTableId?: string;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', description: 'VPC ID na AWS' })
    vpcId?: string;

    @ApiProperty({ example: false, description: 'Se é a route table principal da VPC' })
    isMain?: boolean;

    @ApiProperty({ type: [RouteDto], description: 'Rotas da route table' })
    routes!: RouteDto[];

    @ApiProperty({ type: [RouteTableAssociationDto], description: 'Associações da route table com subnets' })
    associations!: RouteTableAssociationDto[];

    @ApiProperty({ example: { Name: 'prod-public-rt' }, description: 'Tags da Route Table' })
    tags!: Record<string, string>;
}
