import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_sql_instances')
@Unique(['cloudAccountId', 'gcpInstanceId'])
export class GcpSqlInstance {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** Cloud SQL instance name (unique within project) */
    @Column({ type: 'varchar', length: 255, name: 'gcp_instance_id' })
    gcpInstanceId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** MYSQL_8_0, POSTGRES_15, SQLSERVER_2019_STANDARD, etc. */
    @Column({ type: 'varchar', length: 60, name: 'database_version' })
    databaseVersion!: string;

    @Column({ type: 'varchar', length: 100 })
    region!: string;

    /** RUNNABLE, SUSPENDED, PENDING_DELETE, PENDING_CREATE, MAINTENANCE, FAILED */
    @Column({ type: 'varchar', length: 30 })
    state!: string;

    /** db-n1-standard-1, db-f1-micro, db-g1-small, etc. */
    @Column({ type: 'varchar', length: 60, name: 'tier', nullable: true })
    tier!: string | null;

    /** [{ipAddress, type: PRIMARY|OUTGOING|PRIVATE}] */
    @Column({ type: 'jsonb', name: 'ip_addresses', nullable: true })
    ipAddresses!: Record<string, any>[] | null;

    /** PD_SSD or PD_HDD */
    @Column({ type: 'varchar', length: 20, name: 'disk_type', nullable: true })
    diskType!: string | null;

    /** Disk size in GB */
    @Column({ type: 'integer', name: 'disk_size_gb', nullable: true })
    diskSizeGb!: number | null;

    @Column({ type: 'boolean', name: 'backup_enabled', default: false })
    backupEnabled!: boolean;

    /** HIGH_AVAILABILITY or ZONAL */
    @Column({ type: 'varchar', length: 30, name: 'availability_type', nullable: true })
    availabilityType!: string | null;

    @Column({ type: 'jsonb', name: 'user_labels', nullable: true })
    userLabels!: Record<string, string> | null;

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
