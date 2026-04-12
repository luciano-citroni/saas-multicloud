import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_vm_instances')
@Unique(['cloudAccountId', 'gcpInstanceId'])
export class GcpVmInstance {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** GCP numeric instance ID (string representation of uint64) */
    @Column({ type: 'varchar', length: 30, name: 'gcp_instance_id' })
    gcpInstanceId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** Full zone path: zones/us-central1-a */
    @Column({ type: 'varchar', length: 100 })
    zone!: string;

    /** Machine type name: n1-standard-1, e2-medium, etc. */
    @Column({ type: 'varchar', length: 100, name: 'machine_type' })
    machineType!: string;

    /** RUNNING, TERMINATED, STOPPED, STAGING, PROVISIONING, SUSPENDED */
    @Column({ type: 'varchar', length: 30 })
    status!: string;

    @Column({ type: 'varchar', length: 45, name: 'network_ip', nullable: true })
    networkIp!: string | null;

    @Column({ type: 'varchar', length: 45, name: 'external_ip', nullable: true })
    externalIp!: string | null;

    @Column({ type: 'varchar', length: 500, name: 'network_interface', nullable: true })
    networkInterface!: string | null;

    @Column({ type: 'boolean', name: 'deletion_protection', default: false })
    deletionProtection!: boolean;

    @Column({ type: 'boolean', name: 'can_ip_forward', default: false })
    canIpForward!: boolean;

    @Column({ type: 'varchar', length: 100, name: 'service_account_email', nullable: true })
    serviceAccountEmail!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    labels!: Record<string, string> | null;

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
