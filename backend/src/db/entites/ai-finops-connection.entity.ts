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
import { Organization } from './organization.entity';
import { AiFinopsProvider } from './ai-finops-provider.entity';

export type AiFinopsConnectionStatus =
    | 'pending'
    | 'active'
    | 'partial'
    | 'error'
    | 'disabled';

@Entity('ai_finops_connections')
@Index('IDX_ai_finops_connections_tenant_org', ['tenantId', 'organizationId'])
@Index('IDX_ai_finops_connections_provider', ['providerId'])
export class AiFinopsConnection {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Organization>;

    @Column({ type: 'uuid', name: 'provider_id' })
    providerId!: string;

    @ManyToOne(() => AiFinopsProvider, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'provider_id' })
    provider!: Relation<AiFinopsProvider>;

    @Column({ type: 'varchar', length: 64, name: 'provider_slug' })
    providerSlug!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'varchar', length: 255, name: 'provider_account_id', nullable: true })
    providerAccountId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'provider_project_id', nullable: true })
    providerProjectId!: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    region!: string | null;

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    status!: AiFinopsConnectionStatus;

    @Column({ type: 'text', name: 'status_message', nullable: true })
    statusMessage!: string | null;

    @Column({ type: 'timestamptz', name: 'last_sync_at', nullable: true })
    lastSyncAt!: Date | null;

    @Column({ type: 'varchar', length: 32, name: 'last_sync_status', nullable: true })
    lastSyncStatus!: string | null;

    @Column({ type: 'int', name: 'models_count', default: 0 })
    modelsCount!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
