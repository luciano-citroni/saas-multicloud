import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type FinopsCostGranularity = 'daily' | 'monthly';

@Entity('finops_cost_records')
export class FinopsCostRecord {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20, name: 'cloud_provider' })
    cloudProvider!: string;

    /** Nome do serviço (ex: Amazon EC2, Azure Virtual Machines). */
    @Column({ type: 'varchar', length: 255 })
    service!: string;

    @Column({ type: 'varchar', length: 100, default: '' })
    region!: string;

    /** Custo em valor decimal com até 6 casas. */
    @Column({ type: 'decimal', precision: 18, scale: 6 })
    cost!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    /** Data de referência (início do período: dia ou mês). */
    @Column({ type: 'date' })
    date!: Date;

    @Column({ type: 'varchar', length: 10 })
    granularity!: FinopsCostGranularity;

    /** Tags aplicadas ao recurso, se disponíveis. */
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
