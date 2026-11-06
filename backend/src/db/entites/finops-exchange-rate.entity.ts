import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('finops_exchange_rates')
@Index('UQ_finops_exchange_rates_org_month', ['organizationId', 'month'], { unique: true })
export class FinopsExchangeRate {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** Primeiro dia do mês de referência (taxa da fatura, BRL por 1 USD). */
    @Column({ type: 'date' })
    month!: string;

    @Column({ type: 'decimal', precision: 12, scale: 6, name: 'brl_per_usd' })
    brlPerUsd!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
