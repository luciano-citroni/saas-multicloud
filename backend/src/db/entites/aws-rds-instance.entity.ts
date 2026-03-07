import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { AwsVpc } from './aws-vpc.entity';
import { AwsSubnet } from './aws-subnet.entity';
import { AwsSecurityGroup } from './aws-security-group.entity';
import { AwsIamRole } from './aws-iam-role.entity';

/**
 * Representa uma instância RDS sincronizada da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - A instância está vinculada à CloudAccount da organização.
 * - Referências de rede e segurança (VPC, Subnet e Security Group) são resolvidas no banco.
 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_rds_instances')
export class AwsRdsInstance {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    @Column({ type: 'uuid', name: 'subnet_id', nullable: true })
    subnetId!: string | null;

    @Column({ type: 'uuid', name: 'security_group_id', nullable: true })
    securityGroupId!: string | null;

    @Column({ type: 'uuid', name: 'iam_role_id', nullable: true })
    iamRoleId!: string | null;

    @Column({ type: 'varchar', length: 128, name: 'aws_db_instance_identifier', unique: true })
    awsDbInstanceIdentifier!: string;

    @Column({ type: 'varchar', length: 512, name: 'db_instance_arn', nullable: true })
    dbInstanceArn!: string | null;

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    @Column({ type: 'varchar', length: 50, name: 'aws_subnet_id', nullable: true })
    awsSubnetId!: string | null;

    @Column({ type: 'varchar', length: 50, name: 'aws_security_group_id', nullable: true })
    awsSecurityGroupId!: string | null;

    @Column({ type: 'varchar', length: 2048, name: 'role_arn', nullable: true })
    roleArn!: string | null;

    @Column({ type: 'varchar', length: 80, name: 'db_instance_class' })
    dbInstanceClass!: string;

    @Column({ type: 'varchar', length: 50, name: 'engine' })
    engine!: string;

    @Column({ type: 'varchar', length: 50, name: 'engine_version', nullable: true })
    engineVersion!: string | null;

    @Column({ type: 'varchar', length: 50, name: 'status' })
    status!: string;

    @Column({ type: 'varchar', length: 255, name: 'endpoint_address', nullable: true })
    endpointAddress!: string | null;

    @Column({ type: 'int', name: 'endpoint_port', nullable: true })
    endpointPort!: number | null;

    @Column({ type: 'varchar', length: 50, name: 'availability_zone', nullable: true })
    availabilityZone!: string | null;

    @Column({ type: 'boolean', name: 'multi_az', default: false })
    multiAz!: boolean;

    @Column({ type: 'boolean', name: 'publicly_accessible', default: false })
    publiclyAccessible!: boolean;

    @Column({ type: 'varchar', length: 50, name: 'storage_type', nullable: true })
    storageType!: string | null;

    @Column({ type: 'int', name: 'allocated_storage', nullable: true })
    allocatedStorage!: number | null;

    @Column({ type: 'int', name: 'backup_retention_period', nullable: true })
    backupRetentionPeriod!: number | null;

    @Column({ type: 'boolean', name: 'iam_database_authentication_enabled', default: false })
    iamDatabaseAuthenticationEnabled!: boolean;

    @Column({ type: 'boolean', name: 'deletion_protection', default: false })
    deletionProtection!: boolean;

    @Column({ type: 'boolean', name: 'storage_encrypted', default: false })
    storageEncrypted!: boolean;

    @Column({ type: 'varchar', length: 2048, name: 'kms_key_id', nullable: true })
    kmsKeyId!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @ManyToOne(() => AwsVpc, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc | null;

    @ManyToOne(() => AwsSubnet, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'subnet_id' })
    subnet!: AwsSubnet | null;

    @ManyToOne(() => AwsSecurityGroup, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'security_group_id' })
    securityGroup!: AwsSecurityGroup | null;

    @ManyToOne(() => AwsIamRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'iam_role_id' })
    iamRole!: AwsIamRole | null;
}
