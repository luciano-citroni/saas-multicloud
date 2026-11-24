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

export type FinopsForecastHorizon = 'current_month' | 'upcoming';
export type FinopsForecastSource = 'provider' | 'linear';
export type FinopsForecastConfidence = 'low' | 'medium' | 'high';

@Entity('finops_forecast_snapshots')
@Index('UQ_finops_forecast_snapshots', ['cloudAccountId', 'horizon', 'month'], { unique: true })
@Index('IDX_finops_forecast_snapshots_org', ['organizationId', 'cloudAccountId'])
export class FinopsForecastSnapshot {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20 })
    provider!: string;

    /** current_month = fim do mês corrente; upcoming = mês futuro fechado. */
    @Column({ type: 'varchar', length: 20 })
    horizon!: FinopsForecastHorizon;

    /** Calendário YYYY-MM do período previsto. */
    @Column({ type: 'varchar', length: 7 })
    month!: string;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'forecasted_cost' })
    forecastedCost!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'avg_daily_cost', nullable: true })
    avgDailyCost!: number | null;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 20 })
    source!: FinopsForecastSource;

    @Column({ type: 'varchar', length: 10, nullable: true })
    confidence!: FinopsForecastConfidence | null;

    @Column({ type: 'int', name: 'days_elapsed', nullable: true })
    daysElapsed!: number | null;

    @Column({ type: 'int', name: 'days_remaining', nullable: true })
    daysRemaining!: number | null;

    @Column({ type: 'date', name: 'period_start', nullable: true })
    periodStart!: string | null;

    @Column({ type: 'date', name: 'period_end', nullable: true })
    periodEnd!: string | null;

    @Column({ type: 'jsonb', name: 'by_service', nullable: true })
    byService!: Array<{ service: string; forecastedCost: number }> | null;

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
