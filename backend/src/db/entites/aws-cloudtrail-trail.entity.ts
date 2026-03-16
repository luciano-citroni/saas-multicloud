import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsVpc } from './aws-vpc.entity';

/**


 * Representa uma trail do CloudTrail sincronizada da Amazon Web Services.


 */

@Entity('aws_cloudtrail_trails')
export class AwsCloudTrailTrail {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN da trail na AWS. */

    @Column({ type: 'varchar', length: 1024, name: 'trail_arn', unique: true })
    trailArn!: string;

    /** Nome da trail. */

    @Column({ type: 'varchar', length: 255, name: 'name' })
    name!: string;

    /** Nome do bucket S3 onde os logs são armazenados. */

    @Column({ type: 'varchar', length: 1024, name: 's3_bucket_name', nullable: true })
    s3BucketName!: string | null;

    /** Prefixo no S3 para os logs. */

    @Column({ type: 'varchar', length: 1024, name: 's3_key_prefix', nullable: true })
    s3KeyPrefix!: string | null;

    /** Indica se a trail é multi-região. */

    @Column({ type: 'boolean', name: 'is_multi_region_trail', default: false })
    isMultiRegionTrail!: boolean;

    /** Indica se o logging está ativo. */

    @Column({ type: 'boolean', name: 'is_logging', default: false })
    isLogging!: boolean;

    /** Região home da trail. */

    @Column({ type: 'varchar', length: 50, name: 'home_region', nullable: true })
    homeRegion!: string | null;

    /** Indica se a trail é da organização. */

    @Column({ type: 'boolean', name: 'is_organization_trail', default: false })
    isOrganizationTrail!: boolean;

    /** Indica se a validação de integridade de log está ativa. */

    @Column({ type: 'boolean', name: 'log_file_validation_enabled', default: false })
    logFileValidationEnabled!: boolean;

    /** ARN do SNS topic para notificações. */

    @Column({ type: 'varchar', length: 1024, name: 'sns_topic_arn', nullable: true })
    snsTopicArn!: string | null;

    /** ARN do CloudWatch Logs group. */

    @Column({ type: 'varchar', length: 1024, name: 'cloud_watch_logs_log_group_arn', nullable: true })
    cloudWatchLogsLogGroupArn!: string | null;

    /** ID da VPC na AWS (para trails privadas). */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /** ID da VPC no banco de dados. */

    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

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
}
