import { ApiProperty } from '@nestjs/swagger';

export class EksClusterResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050', description: 'ID único do cluster no banco de dados (UUID)' })
    id: string;

    @ApiProperty({ example: 'arn:aws:eks:us-east-1:123456789012:cluster/prod-cluster', description: 'ARN do cluster EKS na AWS' })
    clusterArn: string;

    @ApiProperty({ example: 'prod-cluster', description: 'Nome do cluster EKS' })
    clusterName: string;

    @ApiProperty({ example: 'ACTIVE', description: 'Status atual do cluster', enum: ['CREATING', 'ACTIVE', 'DELETING', 'FAILED', 'UPDATING', 'PENDING'] })
    status: string;

    @ApiProperty({ example: '1.30', description: 'Versão do Kubernetes', nullable: true })
    version: string | null;

    @ApiProperty({ example: 'https://ABCDE.gr7.us-east-1.eks.amazonaws.com', description: 'Endpoint do API Server', nullable: true })
    endpoint: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', description: 'ID da VPC no banco de dados', nullable: true })
    vpcId: string | null;

    @ApiProperty({ example: ['123e4567-e89b-12d3-a456-426614174010'], description: 'IDs dos Security Groups no banco de dados', nullable: true })
    securityGroupIds: string[] | null;

    @ApiProperty({
        example: ['123e4567-e89b-12d3-a456-426614174020'],
        description: 'IDs de instâncias EC2 no banco relacionadas ao cluster',
        nullable: true,
    })
    ec2InstanceIds: string[] | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174030', description: 'ID da role IAM no banco de dados', nullable: true })
    iamRoleId: string | null;

    @ApiProperty({ example: { Environment: 'prod', Team: 'platform' }, description: 'Tags do cluster (pares chave-valor)' })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', description: 'Data e hora da última sincronização', nullable: true, format: 'date-time' })
    lastSyncedAt: Date | null;
}

export class EksClusterSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:eks:us-east-1:123456789012:cluster/prod-cluster', description: 'ARN do cluster EKS na AWS' })
    clusterArn: string;

    @ApiProperty({ example: 'prod-cluster', description: 'Nome do cluster EKS' })
    clusterName: string;

    @ApiProperty({ example: 'ACTIVE', description: 'Status atual do cluster' })
    status: string;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', description: 'ID da VPC na AWS', nullable: true })
    awsVpcId: string | null;

    @ApiProperty({ example: ['sg-0a1b2c3d4e5f67890'], description: 'IDs dos Security Groups na AWS', nullable: true })
    awsSecurityGroupIds: string[] | null;

    @ApiProperty({ example: 'arn:aws:iam::123456789012:role/EksClusterRole', description: 'ARN da role IAM do cluster', nullable: true })
    roleArn: string | null;
}

export class EksClusterWithRelationsResponseDto extends EksClusterResponseDto {
    @ApiProperty({
        example: {
            id: '123e4567-e89b-12d3-a456-426614174001',
            awsVpcId: 'vpc-0a1b2c3d4e5f67890',
            cidrBlock: '10.0.0.0/16',
            state: 'available',
        },
        description: 'VPC vinculada ao cluster',
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
            id: '123e4567-e89b-12d3-a456-426614174030',
            roleArn: 'arn:aws:iam::123456789012:role/EksClusterRole',
            roleName: 'EksClusterRole',
        },
        description: 'Role IAM vinculada ao cluster',
        nullable: true,
    })
    iamRole?: {
        id: string;
        roleArn: string;
        roleName: string;
    } | null;
}
