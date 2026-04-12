import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_gke_clusters')
@Unique(['cloudAccountId', 'gcpClusterId'])
export class GcpGkeCluster {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** Composite key: name/location */
    @Column({ type: 'varchar', length: 300, name: 'gcp_cluster_id' })
    gcpClusterId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** Region (us-central1) or zone (us-central1-a) */
    @Column({ type: 'varchar', length: 100 })
    location!: string;

    /** RUNNING, PROVISIONING, STOPPING, ERROR, DEGRADED, RECONCILING */
    @Column({ type: 'varchar', length: 30 })
    status!: string;

    @Column({ type: 'integer', name: 'node_count', nullable: true })
    nodeCount!: number | null;

    @Column({ type: 'varchar', length: 30, name: 'current_master_version', nullable: true })
    currentMasterVersion!: string | null;

    @Column({ type: 'varchar', length: 30, name: 'current_node_version', nullable: true })
    currentNodeVersion!: string | null;

    /** Master endpoint IP */
    @Column({ type: 'varchar', length: 45, nullable: true })
    endpoint!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'network_name', nullable: true })
    networkName!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'subnetwork', nullable: true })
    subnetwork!: string | null;

    @Column({ type: 'varchar', length: 100, name: 'logging_service', nullable: true })
    loggingService!: string | null;

    @Column({ type: 'varchar', length: 100, name: 'monitoring_service', nullable: true })
    monitoringService!: string | null;

    @Column({ type: 'jsonb', name: 'resource_labels', nullable: true })
    resourceLabels!: Record<string, string> | null;

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
