import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type FinopsJobStatus = 'pending' | 'running' | 'completed' | 'failed';

@Entity('finops_jobs')
export class FinopsJob {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: string;

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    status!: FinopsJobStatus;

    @Column({ type: 'varchar', length: 10 })
    granularity!: 'daily' | 'monthly';

    @Column({ type: 'date', name: 'period_start' })
    periodStart!: Date;

    @Column({ type: 'date', name: 'period_end' })
    periodEnd!: Date;

    /** Número de registros de custo coletados no job. */
    @Column({ type: 'int', name: 'records_collected', nullable: true })
    recordsCollected!: number | null;

    @Column({ type: 'text', nullable: true })
    error!: string | null;

    @Column({ type: 'timestamp', name: 'completed_at', nullable: true })
    completedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
