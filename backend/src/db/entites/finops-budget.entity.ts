import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

export type FinopsBudgetScope = 'organization' | 'cloud_account';
export type FinopsBudgetPeriod = 'daily' | 'monthly';
export type FinopsBudgetAlertFrequency = 'daily' | 'monthly';
/** percentage = limiares % do orçamento; amount = valor absoluto; resource = gasto de um recurso vs orçamento */
export type FinopsBudgetAlertType = 'percentage' | 'amount' | 'resource';
export type FinopsBudgetAlertChannel = 'email' | 'whatsapp';

@Entity('finops_budgets')
export class FinopsBudget {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** Null quando scope = organization (orçamento do tenant inteiro). */
    @Column({ type: 'uuid', name: 'cloud_account_id', nullable: true })
    cloudAccountId!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'cloud_account' })
    scope!: FinopsBudgetScope;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** Valor limite do budget. */
    @Column({ type: 'decimal', precision: 18, scale: 2 })
    amount!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 20, default: 'monthly' })
    period!: FinopsBudgetPeriod;

    /** Filtro por serviço específico. Null = aplica a todos os serviços. */
    @Column({ type: 'varchar', length: 255, nullable: true })
    service!: string | null;

    /** Recurso monitorado quando alertType = resource. */
    @Column({ type: 'varchar', length: 512, name: 'resource_id', nullable: true })
    resourceId!: string | null;

    /**
     * Limiares percentuais para disparo de alertas (tipos percentage/resource).
     * Exemplo: [50, 80, 100].
     */
    @Column({ type: 'jsonb', name: 'alert_thresholds', default: '[]' })
    alertThresholds!: number[];

    /** Frequência de avaliação/envio dos alertas. */
    @Column({ type: 'varchar', length: 20, name: 'alert_frequency', default: 'monthly' })
    alertFrequency!: FinopsBudgetAlertFrequency;

    @Column({ type: 'varchar', length: 20, name: 'alert_type', default: 'percentage' })
    alertType!: FinopsBudgetAlertType;

    /** Valor absoluto do alerta quando alertType = amount. */
    @Column({ type: 'decimal', precision: 18, scale: 2, name: 'alert_amount', nullable: true })
    alertAmount!: number | null;

    /** Canais cadastrados. WhatsApp é aceito no cadastro, mas o envio ainda não é implementado. */
    @Column({ type: 'jsonb', name: 'alert_channels', default: '["email"]' })
    alertChannels!: FinopsBudgetAlertChannel[];

    /** Destinatários de e-mail quando o canal email está ativo. */
    @Column({ type: 'jsonb', name: 'alert_emails', default: '[]' })
    alertEmails!: string[];

    @Column({ type: 'boolean', name: 'is_active', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount> | null;
}
