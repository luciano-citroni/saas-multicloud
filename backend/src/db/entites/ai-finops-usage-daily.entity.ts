import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('ai_finops_usage_daily')
@Index('IDX_ai_finops_usage_daily_tenant_date', ['tenantId', 'usageDate'])
@Index('IDX_ai_finops_usage_daily_lookup', [
    'tenantId',
    'organizationId',
    'connectionId',
    'provider',
    'model',
    'usageSource',
    'usageDate',
])
export class AiFinopsUsageDaily {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'connection_id', nullable: true })
    connectionId!: string | null;

    @Column({ type: 'varchar', length: 64 })
    provider!: string;

    @Column({ type: 'uuid', name: 'application_id', nullable: true })
    applicationId!: string | null;

    @Column({ type: 'uuid', name: 'user_id', nullable: true })
    userId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'provider_user_external_id', nullable: true })
    providerUserExternalId!: string | null;

    @Column({ type: 'uuid', name: 'team_id', nullable: true })
    teamId!: string | null;

    @Column({ type: 'varchar', length: 255 })
    model!: string;

    @Column({ type: 'varchar', length: 32, name: 'usage_source' })
    usageSource!: string;

    @Column({ type: 'date', name: 'usage_date' })
    usageDate!: string;

    @Column({ type: 'bigint', name: 'input_tokens', default: 0 })
    inputTokens!: string;

    @Column({ type: 'bigint', name: 'output_tokens', default: 0 })
    outputTokens!: string;

    @Column({ type: 'bigint', name: 'total_tokens', default: 0 })
    totalTokens!: string;

    @Column({ type: 'decimal', precision: 18, scale: 8, name: 'estimated_cost', default: 0 })
    estimatedCost!: string;

    @Column({ type: 'decimal', precision: 18, scale: 8, name: 'official_cost', default: 0 })
    officialCost!: string;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'int', name: 'request_count', default: 0 })
    requestCount!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
