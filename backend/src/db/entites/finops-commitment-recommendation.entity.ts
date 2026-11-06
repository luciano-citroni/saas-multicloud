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
import type { FinopsCommitmentType } from './finops-commitment-snapshot.entity';

@Entity('finops_commitment_recommendations')
@Index('UQ_finops_commitment_recommendations_key', ['cloudAccountId', 'commitmentType', 'recommendationKey'], {
    unique: true,
})
export class FinopsCommitmentRecommendation {
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

    /** Chave estável para upsert (hash de term+payment+lookback+tipo). */
    @Column({ type: 'varchar', length: 255, name: 'recommendation_key' })
    recommendationKey!: string;

    @Column({ type: 'int', name: 'lookback_days', nullable: true })
    lookbackDays!: number | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    term!: string | null;

    @Column({ type: 'varchar', length: 64, name: 'payment_option', nullable: true })
    paymentOption!: string | null;

    @Column({ type: 'decimal', precision: 18, scale: 4, name: 'estimated_monthly_savings', nullable: true })
    estimatedMonthlySavings!: number | null;

    @Column({ type: 'decimal', precision: 10, scale: 4, name: 'estimated_savings_percentage', nullable: true })
    estimatedSavingsPercentage!: number | null;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'recommended_hourly_commitment', nullable: true })
    recommendedHourlyCommitment!: number | null;

    @Column({ type: 'boolean', default: true })
    eligible!: boolean;

    @Column({ type: 'text', name: 'ineligible_reason', nullable: true })
    ineligibleReason!: string | null;

    @Column({ type: 'text', nullable: true })
    summary!: string | null;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

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
