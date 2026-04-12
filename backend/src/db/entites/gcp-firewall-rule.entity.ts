import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_firewall_rules')
@Unique(['cloudAccountId', 'gcpFirewallId'])
export class GcpFirewallRule {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** GCP numeric firewall rule ID */
    @Column({ type: 'varchar', length: 30, name: 'gcp_firewall_id' })
    gcpFirewallId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    /** GCP network name */
    @Column({ type: 'varchar', length: 255, name: 'network_name', nullable: true })
    networkName!: string | null;

    /** INGRESS or EGRESS */
    @Column({ type: 'varchar', length: 10 })
    direction!: string;

    /** 0-65535 (default 1000) */
    @Column({ type: 'integer', default: 1000 })
    priority!: number;

    /** [{IPProtocol: 'tcp', ports: ['80','443']}] */
    @Column({ type: 'jsonb', nullable: true })
    allowed!: Record<string, any>[] | null;

    @Column({ type: 'jsonb', nullable: true })
    denied!: Record<string, any>[] | null;

    @Column({ type: 'jsonb', name: 'source_ranges', nullable: true })
    sourceRanges!: string[] | null;

    @Column({ type: 'jsonb', name: 'destination_ranges', nullable: true })
    destinationRanges!: string[] | null;

    @Column({ type: 'jsonb', name: 'target_tags', nullable: true })
    targetTags!: string[] | null;

    @Column({ type: 'boolean', default: false })
    disabled!: boolean;

    @Column({ type: 'timestamp', name: 'creation_timestamp', nullable: true })
    creationTimestamp!: Date | null;

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
