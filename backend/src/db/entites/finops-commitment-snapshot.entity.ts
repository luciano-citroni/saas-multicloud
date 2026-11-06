import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type FinopsCommitmentType = 'savings_plan' | 'reservation' | 'cud';

@Entity('finops_commitment_snapshots')
@Index('UQ_finops_commitment_snapshots_external', ['cloudAccountId', 'commitmentType', 'externalId'], {
    unique: true,
})
export class FinopsCommitmentSnapshot {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20 })
    provider!: string;

    @Column({ type: 'varchar', length: 40, name: 'commitment_type' })
    commitmentType!: FinopsCommitmentType;

    /** ID externo no provedor (SP ARN, reservation id, CUD name). */
    @Column({ type: 'varchar', length: 512, name: 'external_id' })
    externalId!: string;

    @Column({ type: 'varchar', length: 512, nullable: true })
    name!: string | null;

    @Column({ type: 'decimal', precision: 10, scale: 4, name: 'utilization_percent', nullable: true })
    utilizationPercent!: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 4, name: 'coverage_percent', nullable: true })
    coveragePercent!: number | null;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'used_commitment', nullable: true })
    usedCommitment!: number | null;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'unused_commitment', nullable: true })
    unusedCommitment!: number | null;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'hourly_commitment', nullable: true })
    hourlyCommitment!: number | null;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'monthly_commitment', nullable: true })
    monthlyCommitment!: number | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    term!: string | null;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'int', name: 'lookback_days', nullable: true })
    lookbackDays!: number | null;

    @Column({ type: 'jsonb', name: 'raw_metadata', nullable: true })
    rawMetadata!: Record<string, unknown> | null;

    @Column({ type: 'timestamptz', name: 'synced_at' })
    syncedAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount>;
}
