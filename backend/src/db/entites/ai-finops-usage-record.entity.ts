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
import { Tenant } from './tenant.entity';
import { AiFinopsConnection } from './ai-finops-connection.entity';

export type AiFinopsUsageSource = 'provider_admin' | 'gateway';
export type AiFinopsUsageStatus = 'success' | 'error' | 'partial' | 'pending_reconciliation';

@Entity('ai_finops_usage_records')
@Index('IDX_ai_finops_usage_tenant_occurred', ['tenantId', 'occurredAt'])
@Index('IDX_ai_finops_usage_connection_occurred', ['connectionId', 'occurredAt'])
@Index('IDX_ai_finops_usage_user_occurred', ['userId', 'occurredAt'])
@Index('IDX_ai_finops_usage_team_occurred', ['teamId', 'occurredAt'])
@Index('IDX_ai_finops_usage_app_occurred', ['applicationId', 'occurredAt'])
export class AiFinopsUsageRecord {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'connection_id', nullable: true })
    connectionId!: string | null;

    @ManyToOne(() => AiFinopsConnection, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'connection_id' })
    connection!: Relation<AiFinopsConnection> | null;

    @Column({ type: 'varchar', length: 64 })
    provider!: string;

    @Column({ type: 'varchar', length: 255, name: 'provider_account_id', nullable: true })
    providerAccountId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'provider_project_id', nullable: true })
    providerProjectId!: string | null;

    @Column({ type: 'uuid', name: 'user_id', nullable: true })
    userId!: string | null;

    /** Provider-native user/actor id (OpenAI user_id, Anthropic actor user_..., etc.). */
    @Column({ type: 'varchar', length: 255, name: 'provider_user_external_id', nullable: true })
    providerUserExternalId!: string | null;

    @Column({ type: 'uuid', name: 'team_id', nullable: true })
    teamId!: string | null;

    @Column({ type: 'uuid', name: 'application_id', nullable: true })
    applicationId!: string | null;

    @Column({ type: 'varchar', length: 255 })
    model!: string;

    @Column({ type: 'varchar', length: 255, name: 'request_id', nullable: true })
    requestId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'provider_request_id', nullable: true })
    providerRequestId!: string | null;

    @Column({ type: 'bigint', name: 'input_tokens', default: 0 })
    inputTokens!: string;

    @Column({ type: 'bigint', name: 'output_tokens', default: 0 })
    outputTokens!: string;

    @Column({ type: 'bigint', name: 'cached_input_tokens', default: 0 })
    cachedInputTokens!: string;

    @Column({ type: 'bigint', name: 'reasoning_tokens', default: 0 })
    reasoningTokens!: string;

    @Column({ type: 'bigint', name: 'other_tokens', default: 0 })
    otherTokens!: string;

    @Column({ type: 'bigint', name: 'total_tokens', default: 0 })
    totalTokens!: string;

    @Column({ type: 'decimal', precision: 18, scale: 8, name: 'estimated_cost', nullable: true })
    estimatedCost!: string | null;

    @Column({ type: 'decimal', precision: 18, scale: 8, name: 'official_cost', nullable: true })
    officialCost!: string | null;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'int', name: 'latency_ms', nullable: true })
    latencyMs!: number | null;

    @Column({ type: 'varchar', length: 32, default: 'success' })
    status!: AiFinopsUsageStatus;

    @Column({ type: 'varchar', length: 32, name: 'usage_source' })
    usageSource!: AiFinopsUsageSource;

    @Column({ type: 'timestamptz', name: 'occurred_at' })
    occurredAt!: Date;

    @CreateDateColumn({ name: 'recorded_at' })
    recordedAt!: Date;

    @Column({ type: 'jsonb', default: '{}' })
    metadata!: Record<string, unknown>;
}
