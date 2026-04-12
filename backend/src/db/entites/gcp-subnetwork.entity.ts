import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_subnetworks')
@Unique(['cloudAccountId', 'gcpSubnetworkId'])
export class GcpSubnetwork {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** GCP numeric subnetwork ID */
    @Column({ type: 'varchar', length: 30, name: 'gcp_subnetwork_id' })
    gcpSubnetworkId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** Region name: us-central1 */
    @Column({ type: 'varchar', length: 100 })
    region!: string;

    /** IPv4 CIDR range: 10.0.0.0/24 */
    @Column({ type: 'varchar', length: 50, name: 'ip_cidr_range' })
    ipCidrRange!: string;

    /** GCP network name (parent VPC) */
    @Column({ type: 'varchar', length: 255, name: 'network_name', nullable: true })
    networkName!: string | null;

    @Column({ type: 'boolean', name: 'private_ip_google_access', default: false })
    privateIpGoogleAccess!: boolean;

    @Column({ type: 'varchar', length: 30, name: 'purpose', nullable: true })
    purpose!: string | null;

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
