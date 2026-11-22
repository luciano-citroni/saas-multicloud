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

export type FinopsRealizedSavingSource = 'manual' | 'recommendation' | 'commitment';

@Entity('finops_realized_savings')
@Index('IDX_finops_realized_savings_org_account', ['organizationId', 'cloudAccountId'])
@Index('IDX_finops_realized_savings_org_executed', ['organizationId', 'executedAt'])
@Index('UQ_finops_realized_savings_source_rec', ['sourceRecommendationId'], {
    unique: true,
    where: '"source_recommendation_id" IS NOT NULL',
})
export class FinopsRealizedSaving {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20 })
    provider!: string;

    /** Nomes/IDs dos recursos otimizados. */
    @Column({ type: 'jsonb', name: 'resource_names', default: () => "'[]'" })
    resourceNames!: string[];

    /** Economia mensal recorrente a partir de executedAt. */
    @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monthly_amount' })
    monthlyAmount!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'text' })
    description!: string;

    @Column({ type: 'date', name: 'executed_at' })
    executedAt!: string;

    @Column({ type: 'varchar', length: 20, default: 'manual' })
    source!: FinopsRealizedSavingSource;

    @Column({ type: 'uuid', name: 'source_recommendation_id', nullable: true })
    sourceRecommendationId!: string | null;

    @Column({ type: 'uuid', name: 'source_commitment_recommendation_id', nullable: true })
    sourceCommitmentRecommendationId!: string | null;

    @Column({ type: 'uuid', name: 'created_by_user_id', nullable: true })
    createdByUserId!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount>;
}
