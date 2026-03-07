import { ApiProperty } from '@nestjs/swagger';

export class RdsInstanceResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174010', description: 'ID único da instância RDS no banco de dados (UUID)' })
    id: string;

    @ApiProperty({ example: 'my-app-db', description: 'DB Instance Identifier na AWS' })
    awsDbInstanceIdentifier: string;

    @ApiProperty({ example: 'arn:aws:rds:us-east-1:123456789012:db:my-app-db', nullable: true, required: false })
    dbInstanceArn: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', nullable: true, required: false })
    vpcId: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174002', nullable: true, required: false })
    subnetId: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174003', nullable: true, required: false })
    securityGroupId: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174004', nullable: true, required: false })
    iamRoleId: string | null;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', nullable: true, required: false })
    awsVpcId: string | null;

    @ApiProperty({ example: 'subnet-0a1b2c3d4e5f67890', nullable: true, required: false })
    awsSubnetId: string | null;

    @ApiProperty({ example: 'sg-0a1b2c3d4e5f67890', nullable: true, required: false })
    awsSecurityGroupId: string | null;

    @ApiProperty({ example: 'arn:aws:iam::123456789012:role/rds-monitoring-role', nullable: true, required: false })
    roleArn: string | null;

    @ApiProperty({ example: 'db.t4g.micro' })
    dbInstanceClass: string;

    @ApiProperty({ example: 'postgres' })
    engine: string;

    @ApiProperty({ example: '16.3', nullable: true, required: false })
    engineVersion: string | null;

    @ApiProperty({ example: 'available' })
    status: string;

    @ApiProperty({ example: 'my-app-db.abc123xyz.us-east-1.rds.amazonaws.com', nullable: true, required: false })
    endpointAddress: string | null;

    @ApiProperty({ example: 5432, nullable: true, required: false })
    endpointPort: number | null;

    @ApiProperty({ example: 'us-east-1a', nullable: true, required: false })
    availabilityZone: string | null;

    @ApiProperty({ example: false })
    multiAz: boolean;

    @ApiProperty({ example: false })
    publiclyAccessible: boolean;

    @ApiProperty({ example: 'gp3', nullable: true, required: false })
    storageType: string | null;

    @ApiProperty({ example: 20, nullable: true, required: false })
    allocatedStorage: number | null;

    @ApiProperty({ example: 7, nullable: true, required: false })
    backupRetentionPeriod: number | null;

    @ApiProperty({ example: true })
    iamDatabaseAuthenticationEnabled: boolean;

    @ApiProperty({ example: true })
    deletionProtection: boolean;

    @ApiProperty({ example: true })
    storageEncrypted: boolean;

    @ApiProperty({ example: 'arn:aws:kms:us-east-1:123456789012:key/abcde1234', nullable: true, required: false })
    kmsKeyId: string | null;

    @ApiProperty({ example: { Name: 'my-app-db', Environment: 'prod' }, nullable: true, required: false })
    tags: Record<string, string> | null;

    @ApiProperty({ example: '2026-03-07T10:15:30Z', nullable: true, required: false, format: 'date-time' })
    lastSyncedAt: Date | null;

    @ApiProperty({ example: '2026-03-07T10:15:30Z', format: 'date-time' })
    createdAt: Date;

    @ApiProperty({ example: '2026-03-07T10:15:30Z', format: 'date-time' })
    updatedAt: Date;
}

export class RdsSyncResponseDto {
    @ApiProperty({ example: 'my-app-db', description: 'DB Instance Identifier na AWS' })
    awsDbInstanceIdentifier: string;

    @ApiProperty({ example: 'arn:aws:rds:us-east-1:123456789012:db:my-app-db', nullable: true, required: false })
    dbInstanceArn: string | null;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', nullable: true, required: false })
    awsVpcId: string | null;

    @ApiProperty({ example: 'subnet-0a1b2c3d4e5f67890', nullable: true, required: false })
    awsSubnetId: string | null;

    @ApiProperty({ example: 'sg-0a1b2c3d4e5f67890', nullable: true, required: false })
    awsSecurityGroupId: string | null;

    @ApiProperty({ example: 'arn:aws:iam::123456789012:role/rds-monitoring-role', nullable: true, required: false })
    roleArn: string | null;

    @ApiProperty({ example: 'db.t4g.micro' })
    dbInstanceClass: string;

    @ApiProperty({ example: 'postgres' })
    engine: string;

    @ApiProperty({ example: '16.3', nullable: true, required: false })
    engineVersion: string | null;

    @ApiProperty({ example: 'available' })
    status: string;

    @ApiProperty({ example: 'my-app-db.abc123xyz.us-east-1.rds.amazonaws.com', nullable: true, required: false })
    endpointAddress: string | null;

    @ApiProperty({ example: 5432, nullable: true, required: false })
    endpointPort: number | null;

    @ApiProperty({ example: 'us-east-1a', nullable: true, required: false })
    availabilityZone: string | null;

    @ApiProperty({ example: false })
    multiAz: boolean;

    @ApiProperty({ example: false })
    publiclyAccessible: boolean;

    @ApiProperty({ example: 'gp3', nullable: true, required: false })
    storageType: string | null;

    @ApiProperty({ example: 20, nullable: true, required: false })
    allocatedStorage: number | null;

    @ApiProperty({ example: 7, nullable: true, required: false })
    backupRetentionPeriod: number | null;

    @ApiProperty({ example: true })
    iamDatabaseAuthenticationEnabled: boolean;

    @ApiProperty({ example: true })
    deletionProtection: boolean;

    @ApiProperty({ example: true })
    storageEncrypted: boolean;

    @ApiProperty({ example: 'arn:aws:kms:us-east-1:123456789012:key/abcde1234', nullable: true, required: false })
    kmsKeyId: string | null;

    @ApiProperty({ example: { Name: 'my-app-db', Environment: 'prod' }, nullable: true, required: false })
    tags: Record<string, string>;
}
