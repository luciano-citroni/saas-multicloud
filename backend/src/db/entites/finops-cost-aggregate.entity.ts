import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('finops_cost_aggregates')
@Index(['organizationId', 'cloudAccountId', 'periodStart', 'periodEnd'])
@Index(['organizationId', 'service', 'periodStart'])
export class FinopsCostAggregate {
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

    @Column({ type: 'varchar', length: 100, name: 'tag_key', default: '' })
    tagKey!: string;

    @Column({ type: 'varchar', length: 512, name: 'tag_value', default: '' })
    tagValue!: string;

    @Column({ type: 'date', name: 'period_start' })
    periodStart!: Date;

    @Column({ type: 'date', name: 'period_end' })
    periodEnd!: Date;

    @Column({ type: 'varchar', length: 20, name: 'period_type', default: 'monthly' })
    periodType!: 'daily' | 'weekly' | 'monthly';

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'total_cost', default: 0 })
    totalCost!: number;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'avg_daily_cost', default: 0 })
    avgDailyCost!: number;

    @Column({ type: 'int', name: 'record_count', default: 0 })
    recordCount!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
