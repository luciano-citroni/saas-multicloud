import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Cotação USD-BRL do dia, gravada às 09:00 (America/Sao_Paulo). */
@Entity('finops_usd_quotes')
@Index('UQ_finops_usd_quotes_day', ['quotedOn'], { unique: true })
export class FinopsUsdQuote {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /** Dia civil em America/Sao_Paulo (YYYY-MM-DD). */
    @Column({ type: 'date', name: 'quoted_on' })
    quotedOn!: string;

    /** Reais por 1 dólar (bid da AwesomeAPI). */
    @Column({ type: 'decimal', precision: 12, scale: 6, name: 'brl_per_usd' })
    brlPerUsd!: number;

    @Column({ type: 'decimal', precision: 10, scale: 6, name: 'pct_change', nullable: true })
    pctChange!: number | null;

    @Column({ type: 'varchar', length: 32, name: 'quoted_at', nullable: true })
    quotedAt!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
