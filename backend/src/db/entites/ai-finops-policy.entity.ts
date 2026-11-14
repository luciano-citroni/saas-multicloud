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

export type AiFinopsPolicyScope =
    | 'organization'
    | 'connection'
    | 'team'
    | 'user'
    | 'application';
export type AiFinopsOnLimitAction =
    | 'notify'
    | 'block'
    | 'rate_limit'
    | 'block_models'
    | 'fallback';

@Entity('ai_finops_policies')
@Index('IDX_ai_finops_policies_tenant_scope', ['tenantId', 'scopeType', 'scopeId'])
export class AiFinopsPolicy {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 32, name: 'scope_type' })
    scopeType!: AiFinopsPolicyScope;

    @Column({ type: 'varchar', length: 255, name: 'scope_id', nullable: true })
    scopeId!: string | null;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'bigint', name: 'max_tokens', nullable: true })
    maxTokens!: string | null;

    @Column({ type: 'decimal', precision: 18, scale: 4, name: 'max_cost', nullable: true })
    maxCost!: string | null;

    @Column({ type: 'int', name: 'max_requests_per_minute', nullable: true })
    maxRequestsPerMinute!: number | null;

    @Column({ type: 'jsonb', name: 'allowed_providers', default: '[]' })
    allowedProviders!: string[];

    @Column({ type: 'jsonb', name: 'allowed_models', default: '[]' })
    allowedModels!: string[];

    @Column({ type: 'varchar', length: 32, name: 'on_limit_action', default: 'notify' })
    onLimitAction!: AiFinopsOnLimitAction;

    @Column({ type: 'jsonb', name: 'fallback_config', default: '{}' })
    fallbackConfig!: Record<string, unknown>;

    @Column({ type: 'varchar', length: 32, default: 'active' })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
