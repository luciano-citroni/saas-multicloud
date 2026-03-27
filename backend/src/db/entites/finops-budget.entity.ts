import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

@Entity('finops_budgets')
export class FinopsBudget {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    /** Valor limite do budget. */
    @Column({ type: 'decimal', precision: 18, scale: 2 })
    amount!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    /** Periodicidade do budget (apenas mensal por ora). */
    @Column({ type: 'varchar', length: 20, default: 'monthly' })
    period!: 'monthly';

    /** Filtro por serviço específico. Null = aplica a todos os serviços. */
    @Column({ type: 'varchar', length: 255, nullable: true })
    service!: string | null;

    /**
     * Limiares percentuais para disparo de alertas.
     * Exemplo: [50, 80, 100] gera alertas em 50%, 80% e 100% do budget.
     */
    @Column({ type: 'jsonb', name: 'alert_thresholds', default: '[]' })
    alertThresholds!: number[];

    @Column({ type: 'boolean', name: 'is_active', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
