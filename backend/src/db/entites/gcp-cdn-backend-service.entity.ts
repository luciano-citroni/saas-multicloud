import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_cdn_backend_services')
@Unique(['cloudAccountId', 'gcpBackendServiceId'])
export class GcpCdnBackendService {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** Numeric GCP ID of the backend service */
    @Column({ type: 'varchar', length: 100, name: 'gcp_backend_service_id' })
    gcpBackendServiceId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** us-central1 or "global" */
    @Column({ type: 'varchar', length: 100 })
    region!: string;

    /** Load-balancing scheme: EXTERNAL, EXTERNAL_MANAGED, INTERNAL_MANAGED, INTERNAL_SELF_MANAGED */
    @Column({ type: 'varchar', length: 50, name: 'load_balancing_scheme', nullable: true })
    loadBalancingScheme!: string | null;

    /** Backend protocol: HTTP, HTTPS, HTTP2, GRPC, TCP, SSL */
    @Column({ type: 'varchar', length: 20, nullable: true })
    protocol!: string | null;

    @Column({ type: 'boolean', name: 'cdn_enabled', default: false })
    cdnEnabled!: boolean;

    /** Cache mode: USE_ORIGIN_HEADERS, FORCE_CACHE_ALL, CACHE_ALL_STATIC */
    @Column({ type: 'varchar', length: 50, name: 'cache_mode', nullable: true })
    cacheMode!: string | null;

    /** Default TTL in seconds */
    @Column({ type: 'integer', name: 'default_ttl_seconds', nullable: true })
    defaultTtlSeconds!: number | null;

    /** Max TTL in seconds */
    @Column({ type: 'integer', name: 'max_ttl_seconds', nullable: true })
    maxTtlSeconds!: number | null;

    /** Connection draining timeout in seconds */
    @Column({ type: 'integer', name: 'connection_draining_timeout_sec', nullable: true })
    connectionDrainingTimeoutSec!: number | null;

    /** List of backend group URLs */
    @Column({ type: 'jsonb', nullable: true })
    backends!: Record<string, unknown>[] | null;

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
