import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved';

@Entity('finops_cost_anomalies')
@Index(['organizationId', 'cloudAccountId', 'anomalyDate'])
@Index(['organizationId', 'status', 'severity'])
export class FinopsCostAnomaly {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: string;

    @Column({ type: 'varchar', length: 255 })
    service!: string;

    @Column({ type: 'varchar', length: 100, default: '' })
    region!: string;

    @Column({ type: 'date', name: 'anomaly_date' })
    anomalyDate!: Date;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'expected_cost' })
    expectedCost!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'actual_cost' })
    actualCost!: number;

    @Column({ type: 'decimal', precision: 8, scale: 4, name: 'deviation_percentage' })
    deviationPercentage!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'financial_impact' })
    financialImpact!: number;

    @Column({ type: 'varchar', length: 20, default: 'medium' })
    severity!: AnomalySeverity;

    @Column({ type: 'varchar', length: 20, default: 'open' })
    status!: AnomalyStatus;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
