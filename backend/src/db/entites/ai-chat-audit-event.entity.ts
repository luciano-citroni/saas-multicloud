import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('ai_chat_audit_events')
export class AiChatAuditEvent {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'actor_id', nullable: true })
    actorId!: string | null;

    @Column({ type: 'varchar', length: 64 })
    action!: string;

    @Column({ type: 'varchar', length: 64, name: 'entity_type' })
    entityType!: string;

    @Column({ type: 'uuid', name: 'entity_id', nullable: true })
    entityId!: string | null;

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
