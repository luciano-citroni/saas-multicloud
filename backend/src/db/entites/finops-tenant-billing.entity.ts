import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

export type TenantBillingStatus = 'draft' | 'finalized' | 'invoiced';

@Entity('finops_tenant_billing')
@Index(['organizationId', 'cloudAccountId', 'periodStart', 'periodEnd'])
@Index(['organizationId', 'status'])
export class FinopsTenantBilling {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'date', name: 'period_start' })
    periodStart!: Date;

    @Column({ type: 'date', name: 'period_end' })
    periodEnd!: Date;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'cloud_cost', default: 0 })
    cloudCost!: number;

    @Column({ type: 'decimal', precision: 8, scale: 4, name: 'markup_percentage', default: 0 })
    markupPercentage!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'markup_amount', default: 0 })
    markupAmount!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'final_price', default: 0 })
    finalPrice!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'margin', default: 0 })
    margin!: number;

    @Column({ type: 'decimal', precision: 8, scale: 4, name: 'margin_percentage', default: 0 })
    marginPercentage!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 20, default: 'draft' })
    status!: TenantBillingStatus;

    @Column({ type: 'jsonb', name: 'chargeback_breakdown', nullable: true })
    chargebackBreakdown!: Record<string, any> | null;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
