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
import { User } from './user.entity';

@Entity('ai_finops_audit_logs')
@Index('IDX_ai_finops_audit_tenant_created', ['tenantId', 'createdAt'])
export class AiFinopsAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'user_id', nullable: true })
    userId!: string | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User> | null;

    @Column({ type: 'varchar', length: 64 })
    action!: string;

    @Column({ type: 'varchar', length: 64, name: 'entity_type' })
    entityType!: string;

    @Column({ type: 'uuid', name: 'entity_id', nullable: true })
    entityId!: string | null;

    @Column({ type: 'jsonb', default: '{}' })
    metadata!: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
