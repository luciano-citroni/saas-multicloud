import { ApiProperty } from '@nestjs/swagger';

export class SecurityGroupIpRangeDto {
    @ApiProperty({
        example: '0.0.0.0/0',
        description: 'CIDR de endereço IP permitido',
    })
    cidr: string;

    @ApiProperty({
        example: 'Allow all HTTP traffic',
        description: 'Descrição opcional da regra de IP',
        nullable: true,
        required: false,
    })
    description?: string;
}

export class SecurityGroupReferencedGroupDto {
    @ApiProperty({
        example: 'sg-0a1b2c3d4e5f67890',
        description: 'ID do Security Group referenciado na AWS',
    })
    groupId: string;

    @ApiProperty({
        example: '123456789012',
        description: 'ID da conta AWS proprietária do Security Group referenciado',
    })
    userId: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC do Security Group referenciado',
        nullable: true,
        required: false,
    })
    vpcId?: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174010',
        description: 'UUID do Security Group referenciado no banco de dados. Preenchido quando o Security Group referenciado já foi sincronizado.',
        nullable: true,
        required: false,
    })
    securityGroupId?: string;
}

export class SecurityGroupPrefixListDto {
    @ApiProperty({
        example: 'pl-63a5400a',
        description: 'ID da Prefix List',
    })
    prefixListId: string;

    @ApiProperty({
        example: 'Allow S3 access',
        description: 'Descrição opcional',
        nullable: true,
        required: false,
    })
    description?: string;
}

export class SecurityGroupRuleDto {
    @ApiProperty({
        example: 'tcp',
        description: 'Protocolo da regra: tcp, udp, icmp ou -1 (todos)',
    })
    protocol: string;

    @ApiProperty({
        example: 80,
        description: 'Porta inicial da regra (-1 para todos os protocolos)',
        nullable: true,
    })
    fromPort: number | null;

    @ApiProperty({
        example: 80,
        description: 'Porta final da regra (-1 para todos os protocolos)',
        nullable: true,
    })
    toPort: number | null;

    @ApiProperty({
        type: [SecurityGroupIpRangeDto],
        description: 'Faixas de IPs IPv4 permitidas (CIDR)',
    })
    ipv4Ranges: SecurityGroupIpRangeDto[];

    @ApiProperty({
        type: [SecurityGroupIpRangeDto],
        description: 'Faixas de IPs IPv6 permitidas (CIDR)',
    })
    ipv6Ranges: SecurityGroupIpRangeDto[];

    @ApiProperty({
        type: [SecurityGroupReferencedGroupDto],
        description: 'Security Groups referenciados nesta regra',
    })
    referencedSecurityGroups: SecurityGroupReferencedGroupDto[];

    @ApiProperty({
        type: [SecurityGroupPrefixListDto],
        description: 'Prefix Lists referenciadas nesta regra',
    })
    prefixListIds: SecurityGroupPrefixListDto[];

    @ApiProperty({
        example: 'Allow HTTP from anywhere',
        description: 'Descrição da regra',
        nullable: true,
        required: false,
    })
    description?: string;
}

export class SecurityGroupResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174010',
        description: 'ID único do Security Group no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'sg-0a1b2c3d4e5f67890',
        description: 'ID do Security Group na AWS',
    })
    awsSecurityGroupId: string;

    @ApiProperty({
        example: 'my-security-group',
        description: 'Nome do Security Group',
    })
    name: string;

    @ApiProperty({
        example: 'Security group for web servers',
        description: 'Descrição do Security Group',
    })
    description: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC na AWS',
        nullable: true,
    })
    awsVpcId: string | null;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',
        description: 'ID da VPC no banco de dados',
        nullable: true,
    })
    vpcId: string | null;

    @ApiProperty({
        example: '123456789012',
        description: 'ID da conta AWS proprietária',
    })
    ownerId: string;

    @ApiProperty({
        type: [SecurityGroupRuleDto],
        description: 'Regras de entrada (inbound/ingress)',
        nullable: true,
    })
    inboundRules: SecurityGroupRuleDto[] | null;

    @ApiProperty({
        type: [SecurityGroupRuleDto],
        description: 'Regras de saída (outbound/egress)',
        nullable: true,
    })
    outboundRules: SecurityGroupRuleDto[] | null;

    @ApiProperty({
        example: { Name: 'web-sg', Environment: 'prod' },
        description: 'Tags do Security Group (pares chave-valor)',
        nullable: true,
    })
    tags: Record<string, string> | null;

    @ApiProperty({
        example: '2026-03-07T10:15:30Z',
        description: 'Data e hora da última sincronização',
        nullable: true,
        format: 'date-time',
    })
    lastSyncedAt: Date | null;

    @ApiProperty({
        example: '2026-03-07T10:15:30Z',
        description: 'Data de criação no banco de dados',
        format: 'date-time',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-03-07T10:15:30Z',
        description: 'Data de última atualização no banco de dados',
        format: 'date-time',
    })
    updatedAt: Date;
}

export class SecurityGroupSyncResponseDto {
    @ApiProperty({
        example: 'sg-0a1b2c3d4e5f67890',
        description: 'ID do Security Group na AWS',
    })
    awsSecurityGroupId: string;

    @ApiProperty({
        example: 'my-security-group',
        description: 'Nome do Security Group',
    })
    name: string;

    @ApiProperty({
        example: 'Security group for web servers',
        description: 'Descrição do Security Group',
    })
    description: string;

    @ApiProperty({
        example: 'vpc-0a1b2c3d4e5f67890',
        description: 'ID da VPC na AWS',
        nullable: true,
    })
    awsVpcId: string | null;

    @ApiProperty({
        example: '123456789012',
        description: 'ID da conta AWS proprietária',
    })
    ownerId: string;

    @ApiProperty({
        type: [SecurityGroupRuleDto],
        description: 'Regras de entrada (inbound/ingress)',
    })
    inboundRules: SecurityGroupRuleDto[];

    @ApiProperty({
        type: [SecurityGroupRuleDto],
        description: 'Regras de saída (outbound/egress)',
    })
    outboundRules: SecurityGroupRuleDto[];

    @ApiProperty({
        example: { Name: 'web-sg', Environment: 'prod' },
        description: 'Tags do Security Group',
    })
    tags: Record<string, string>;
}
