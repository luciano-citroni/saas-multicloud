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

export type AiFinopsSyncStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

@Entity('ai_finops_provider_syncs')
@Index('IDX_ai_finops_provider_syncs_connection', ['connectionId', 'startedAt'])
export class AiFinopsProviderSync {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'connection_id' })
    connectionId!: string;

    @ManyToOne(() => AiFinopsConnection, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'connection_id' })
    connection!: Relation<AiFinopsConnection>;

    @Column({ type: 'varchar', length: 64, name: 'sync_type', default: 'incremental' })
    syncType!: string;

    @Column({ type: 'varchar', length: 32, default: 'pending' })
    status!: AiFinopsSyncStatus;

    @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
    startedAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
    finishedAt!: Date | null;

    @Column({ type: 'int', name: 'records_processed', default: 0 })
    recordsProcessed!: number;

    @Column({ type: 'text', name: 'error_message', nullable: true })
    errorMessage!: string | null;

    @Column({ type: 'jsonb', default: '{}' })
    metadata!: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
