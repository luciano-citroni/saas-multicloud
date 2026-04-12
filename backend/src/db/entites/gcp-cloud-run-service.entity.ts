import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_cloud_run_services')
@Unique(['cloudAccountId', 'gcpServiceName'])
export class GcpCloudRunService {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**
     * Full resource name: projects/{project}/locations/{region}/services/{service}
     */
    @Column({ type: 'varchar', length: 500, name: 'gcp_service_name' })
    gcpServiceName!: string;

    /** Short display name */
    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** us-central1, europe-west1, etc. */
    @Column({ type: 'varchar', length: 100 })
    region!: string;

    /** CONDITION_TYPE_UNSPECIFIED, READY, FAILED */
    @Column({ type: 'varchar', length: 50, nullable: true })
    condition!: string | null;

    /** Public URL served by Cloud Run */
    @Column({ type: 'varchar', length: 500, nullable: true })
    uri!: string | null;

    /** Whether the service allows unauthenticated (public) invocations */
    @Column({ type: 'boolean', name: 'allows_unauthenticated', default: false })
    allowsUnauthenticated!: boolean;

    /** Latest serving revision name */
    @Column({ type: 'varchar', length: 300, name: 'latest_ready_revision', nullable: true })
    latestReadyRevision!: string | null;

    /** Image used by the latest revision */
    @Column({ type: 'varchar', length: 500, name: 'container_image', nullable: true })
    containerImage!: string | null;

    /** Maximum number of instances (scaling) */
    @Column({ type: 'integer', name: 'max_instance_count', nullable: true })
    maxInstanceCount!: number | null;

    /** Minimum number of instances (scaling) */
    @Column({ type: 'integer', name: 'min_instance_count', nullable: true })
    minInstanceCount!: number | null;

    /** CPU limit (e.g. "1000m") */
    @Column({ type: 'varchar', length: 30, name: 'cpu_limit', nullable: true })
    cpuLimit!: string | null;

    /** Memory limit (e.g. "512Mi") */
    @Column({ type: 'varchar', length: 30, name: 'memory_limit', nullable: true })
    memoryLimit!: string | null;

    /** VPC connector name, if any */
    @Column({ type: 'varchar', length: 300, name: 'vpc_connector', nullable: true })
    vpcConnector!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    labels!: Record<string, string> | null;

    @Column({ type: 'timestamp', name: 'create_time', nullable: true })
    createTime!: Date | null;

    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
