import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

@Entity('gcp_service_accounts')
@Unique(['cloudAccountId', 'email'])
export class GcpServiceAccount {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** GCP unique numeric ID */
    @Column({ type: 'varchar', length: 30, name: 'gcp_unique_id', nullable: true })
    gcpUniqueId!: string | null;

    /** SA email address: name@project.iam.gserviceaccount.com */
    @Column({ type: 'varchar', length: 255 })
    email!: string;

    /** Display name */
    @Column({ type: 'varchar', length: 255, name: 'display_name', nullable: true })
    displayName!: string | null;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'boolean', default: false })
    disabled!: boolean;

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
