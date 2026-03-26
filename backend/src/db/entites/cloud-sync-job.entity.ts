import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { CloudProvider } from './cloud-account.entity';

export type SyncJobStatus = 'running' | 'completed' | 'failed';

@Entity('cloud_sync_jobs')
export class CloudSyncJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'cloud_account_id' })
    cloudAccountId: string;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount: CloudAccount;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId: string;

    @Column({ type: 'varchar', length: 10 })
    provider: CloudProvider;

    @Column({ type: 'varchar', length: 20, default: 'running' })
    status: SyncJobStatus;

    @Column({ type: 'text', nullable: true, name: 'error' })
    error: string | null;

    @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
    completedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
