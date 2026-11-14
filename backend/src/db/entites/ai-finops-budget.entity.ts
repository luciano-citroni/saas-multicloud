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
import { Tenant } from './tenant.entity';

export type AiFinopsBudgetScope =
    | 'organization'
    | 'provider'
    | 'connection'
    | 'model'
    | 'team'
    | 'user'
    | 'application'
    | 'license'
    | 'credit';

@Entity('ai_finops_budgets')
@Index('IDX_ai_finops_budgets_tenant_org', ['tenantId', 'organizationId'])
export class AiFinopsBudget {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'varchar', length: 32, name: 'scope_type' })
    scopeType!: AiFinopsBudgetScope;

    @Column({ type: 'varchar', length: 255, name: 'scope_id', nullable: true })
    scopeId!: string | null;

    @Column({ type: 'decimal', precision: 18, scale: 4, name: 'budget_amount' })
    budgetAmount!: string;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 20, default: 'monthly' })
    period!: string;

    @Column({ type: 'jsonb', name: 'alert_thresholds', default: '[50, 75, 90, 100]' })
    alertThresholds!: number[];

    @Column({ type: 'jsonb', name: 'alert_channels', default: '["email"]' })
    alertChannels!: string[];

    @Column({ type: 'jsonb', name: 'alert_notification_group_ids', default: '[]' })
    alertNotificationGroupIds!: string[];

    @Column({ type: 'varchar', length: 32, default: 'active' })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
