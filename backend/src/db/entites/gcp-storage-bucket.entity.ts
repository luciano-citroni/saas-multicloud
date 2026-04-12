import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_storage_buckets')
@Unique(['cloudAccountId', 'gcpBucketId'])
export class GcpStorageBucket {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** Bucket name — used as GCP ID (globally unique) */
    @Column({ type: 'varchar', length: 255, name: 'gcp_bucket_id' })
    gcpBucketId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** US, EU, ASIA, us-central1, etc. */
    @Column({ type: 'varchar', length: 100 })
    location!: string;

    /** multi-region, region, dual-region */
    @Column({ type: 'varchar', length: 30, name: 'location_type', nullable: true })
    locationType!: string | null;

    /** STANDARD, NEARLINE, COLDLINE, ARCHIVE */
    @Column({ type: 'varchar', length: 20, name: 'storage_class' })
    storageClass!: string;

    @Column({ type: 'boolean', name: 'versioning_enabled', default: false })
    versioningEnabled!: boolean;

    /** enforced or inherited */
    @Column({ type: 'varchar', length: 20, name: 'public_access_prevention', nullable: true })
    publicAccessPrevention!: string | null;

    @Column({ type: 'boolean', name: 'uniform_bucket_level_access', default: false })
    uniformBucketLevelAccess!: boolean;

    @Column({ type: 'jsonb', nullable: true })
    labels!: Record<string, string> | null;

    @Column({ type: 'timestamp', name: 'time_created', nullable: true })
    timeCreated!: Date | null;

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
