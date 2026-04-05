import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type FinopsCostGranularity = 'daily' | 'monthly';

@Entity('finops_cost_records')
@Index(['organizationId', 'cloudAccountId', 'date'])
@Index(['date', 'service'])
@Index(['organizationId', 'cloudAccountId', 'service', 'date'])
export class FinopsCostRecord {
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

    @Column({ type: 'varchar', length: 512, name: 'resource_id', default: '' })
    resourceId!: string;

    @Column({ type: 'varchar', length: 100, default: '' })
    region!: string;

    @Column({ type: 'varchar', length: 255, name: 'usage_type', default: '' })
    usageType!: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    operation!: string;

    @Column({ type: 'decimal', precision: 18, scale: 6 })
    cost!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'usage_quantity', default: 0 })
    usageQuantity!: number;

    @Column({ type: 'varchar', length: 50, name: 'usage_unit', default: '' })
    usageUnit!: string;

    @Column({ type: 'date' })
    date!: Date;

    @Column({ type: 'varchar', length: 10 })
    granularity!: FinopsCostGranularity;

    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, any> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
