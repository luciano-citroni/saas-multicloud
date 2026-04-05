import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

export type CostSyncRunStatus = 'running' | 'completed' | 'failed' | 'partial';

@Entity('finops_cost_sync_runs')
@Index(['organizationId', 'cloudAccountId'])
@Index(['organizationId', 'status'])
export class FinopsCostSyncRun {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: string;

    @Column({ type: 'date', name: 'start_date' })
    startDate!: Date;

    @Column({ type: 'date', name: 'end_date' })
    endDate!: Date;

    @Column({ type: 'varchar', length: 20, default: 'running' })
    status!: CostSyncRunStatus;

    @Column({ type: 'int', name: 'records_upserted', default: 0 })
    recordsUpserted!: number;

    @Column({ type: 'text', name: 'error_message', nullable: true })
    errorMessage!: string | null;

    @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
    completedAt!: Date | null;

    @Column({ type: 'varchar', length: 30, name: 'trigger_type', default: 'manual' })
    triggerType!: 'manual' | 'scheduled_daily' | 'scheduled_monthly_close';

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
