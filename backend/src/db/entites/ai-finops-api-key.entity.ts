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
import { AiFinopsApplication } from './ai-finops-application.entity';
import { User } from './user.entity';

@Entity('ai_finops_api_keys')
@Index('IDX_ai_finops_api_keys_tenant_app', ['tenantId', 'applicationId'])
@Index('IDX_ai_finops_api_keys_prefix', ['keyPrefix'])
export class AiFinopsApiKey {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'application_id' })
    applicationId!: string;

    @ManyToOne(() => AiFinopsApplication, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'application_id' })
    application!: Relation<AiFinopsApplication>;

    @Column({ type: 'uuid', name: 'user_id', nullable: true })
    userId!: string | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User> | null;

    @Column({ type: 'varchar', length: 128 })
    name!: string;

    @Column({ type: 'varchar', length: 128, name: 'key_hash', select: false })
    keyHash!: string;

    @Column({ type: 'varchar', length: 16, name: 'key_prefix' })
    keyPrefix!: string;

    @Column({ type: 'jsonb', default: '{}' })
    permissions!: Record<string, unknown>;

    @Column({ type: 'jsonb', name: 'allowed_providers', default: '[]' })
    allowedProviders!: string[];

    @Column({ type: 'jsonb', name: 'allowed_models', default: '[]' })
    allowedModels!: string[];

    @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
    expiresAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'last_used_at', nullable: true })
    lastUsedAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
    revokedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
