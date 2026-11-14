import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

@Entity('ai_finops_provider_users')
@Unique('UQ_ai_finops_provider_users_tenant_provider_external', [
    'tenantId',
    'provider',
    'externalId',
])
@Index('IDX_ai_finops_provider_users_lookup', ['tenantId', 'provider', 'externalId'])
@Index('IDX_ai_finops_provider_users_connection', ['connectionId'])
export class AiFinopsProviderUser {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @Column({ type: 'uuid', name: 'connection_id', nullable: true })
    connectionId!: string | null;

    @Column({ type: 'varchar', length: 64 })
    provider!: string;

    @Column({ type: 'varchar', length: 255, name: 'external_id' })
    externalId!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    email!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    name!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    role!: string | null;

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, unknown>;

    @Column({ type: 'timestamptz', name: 'synced_at', nullable: true })
    syncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
