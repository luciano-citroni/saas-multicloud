import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type RecommendationPriority = 'low' | 'medium' | 'high';
export type RecommendationStatus = 'open' | 'dismissed' | 'resolved';

@Entity('finops_recommendations')
export class FinopsRecommendation {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: string;

    /**
     * Categoria da recomendação.
     * Exemplos: underutilized_ec2, unused_ebs, oversized_rds, unused_disk
     */
    @Column({ type: 'varchar', length: 100 })
    type!: string;

    @Column({ type: 'varchar', length: 512, name: 'resource_id' })
    resourceId!: string;

    @Column({ type: 'varchar', length: 100, name: 'resource_type' })
    resourceType!: string;

    @Column({ type: 'text' })
    description!: string;

    @Column({ type: 'text' })
    recommendation!: string;

    /** Economia potencial estimada em moeda base. */
    @Column({ type: 'decimal', precision: 18, scale: 2, name: 'potential_saving', nullable: true })
    potentialSaving!: number | null;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 10, default: 'medium' })
    priority!: RecommendationPriority;

    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, any> | null;

    @Column({ type: 'varchar', length: 20, default: 'open' })
    status!: RecommendationStatus;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
