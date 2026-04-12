import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_vpc_networks')
@Unique(['cloudAccountId', 'gcpNetworkId'])
export class GcpVpcNetwork {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** GCP numeric network ID */
    @Column({ type: 'varchar', length: 30, name: 'gcp_network_id' })
    gcpNetworkId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    /** REGIONAL or GLOBAL */
    @Column({ type: 'varchar', length: 20, name: 'routing_mode', nullable: true })
    routingMode!: string | null;

    @Column({ type: 'boolean', name: 'auto_create_subnetworks', default: false })
    autoCreateSubnetworks!: boolean;

    @Column({ type: 'jsonb', name: 'subnetwork_urls', nullable: true })
    subnetworkUrls!: string[] | null;

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
