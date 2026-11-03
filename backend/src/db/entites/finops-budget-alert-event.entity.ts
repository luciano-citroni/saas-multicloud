import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    type Relation,
} from 'typeorm';

import { FinopsBudget } from './finops-budget.entity';
import type { FinopsBudgetAlertChannel } from './finops-budget.entity';

/**
 * Registro idempotente de alerta já enviado para um limiar em um período.
 * Unique (budget_id, threshold, period_key, channel) evita reenvio no mesmo ciclo.
 */
@Entity('finops_budget_alert_events')
@Index('UQ_finops_budget_alert_events_dedupe', ['budgetId', 'threshold', 'periodKey', 'channel'], {
    unique: true,
})
export class FinopsBudgetAlertEvent {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'budget_id' })
    budgetId!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** Limiar percentual que disparou o alerta (ex.: 80, 100). */
    @Column({ type: 'int' })
    threshold!: number;

    /**
     * Chave do ciclo de notificação derivado de alertFrequency.
     * daily → YYYY-MM-DD-{0|1} (2 slots/dia UTC); monthly → YYYY-MM.
     */
    @Column({ type: 'varchar', length: 32, name: 'period_key' })
    periodKey!: string;

    @Column({ type: 'varchar', length: 20 })
    channel!: FinopsBudgetAlertChannel;

    @Column({ type: 'timestamptz', name: 'sent_at' })
    sentAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => FinopsBudget, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'budget_id' })
    budget!: Relation<FinopsBudget>;
}
