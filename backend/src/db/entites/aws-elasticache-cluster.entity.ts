import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { AwsVpc } from './aws-vpc.entity';

/**
 * Representa um cluster ElastiCache sincronizado da Amazon Web Services.
 */
@Entity('aws_elasticache_clusters')
export class AwsElastiCacheCluster {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID do cluster ElastiCache na AWS. */
    @Column({ type: 'varchar', length: 255, name: 'cache_cluster_id', unique: true })
    cacheClusterId!: string;

    /** ARN do cluster. */
    @Column({ type: 'varchar', length: 1024, name: 'cluster_arn', nullable: true })
    clusterArn!: string | null;

    /** Status do cluster (available, creating, deleted, deleting, etc). */
    @Column({ type: 'varchar', length: 30, name: 'cache_cluster_status', nullable: true })
    cacheClusterStatus!: string | null;

    /** Tipo do node de cache (ex: cache.t3.micro). */
    @Column({ type: 'varchar', length: 50, name: 'cache_node_type', nullable: true })
    cacheNodeType!: string | null;

    /** Engine (redis, memcached). */
    @Column({ type: 'varchar', length: 20, name: 'engine', nullable: true })
    engine!: string | null;

    /** Versão da engine. */
    @Column({ type: 'varchar', length: 20, name: 'engine_version', nullable: true })
    engineVersion!: string | null;

    /** Número de nodes de cache. */
    @Column({ type: 'int', name: 'num_cache_nodes', nullable: true })
    numCacheNodes!: number | null;

    /** Nome do subnet group. */
    @Column({ type: 'varchar', length: 255, name: 'cache_subnet_group_name', nullable: true })
    cacheSubnetGroupName!: string | null;

    /** IDs de Security Groups na AWS. */
    @Column({ type: 'jsonb', name: 'aws_security_group_ids', nullable: true })
    awsSecurityGroupIds!: string[] | null;

    /** IDs de Security Groups no banco de dados. */
    @Column('uuid', { array: true, name: 'security_group_ids', nullable: true })
    securityGroupIds!: string[] | null;

    /** ID da VPC na AWS. */
    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /** ID da VPC no banco de dados. */
    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /** Endpoint primário de conexão. */
    @Column({ type: 'varchar', length: 1024, name: 'configuration_endpoint', nullable: true })
    configurationEndpoint!: string | null;

    /** Porta de conexão. */
    @Column({ type: 'int', name: 'port', nullable: true })
    port!: number | null;

    /** Indica se Multi-AZ está habilitado. */
    @Column({ type: 'boolean', name: 'multi_az', default: false })
    multiAz!: boolean;

    /** Indica se auto minor version upgrade está habilitado. */
    @Column({ type: 'boolean', name: 'auto_minor_version_upgrade', default: false })
    autoMinorVersionUpgrade!: boolean;

    /** Data de criação na AWS. */
    @Column({ type: 'timestamp', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

    /** Tags em JSON. */
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
}
