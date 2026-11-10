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

@Entity('ai_knowledge_chunks')
@Index('IDX_ai_knowledge_chunks_org_source', ['organizationId', 'source'])
export class AiKnowledgeChunk {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /** Null = global SaaS knowledge (shared). */
    @Column({ type: 'uuid', name: 'organization_id', nullable: true })
    organizationId!: string | null;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Tenant> | null;

    @Column({ type: 'varchar', length: 100 })
    source!: string;

    @Column({ type: 'varchar', length: 300 })
    title!: string;

    @Column({ type: 'text' })
    content!: string;

    /** pgvector column — stored as stringified vector for TypeORM compatibility. */
    @Column({ type: 'varchar', length: 64, name: 'content_hash' })
    contentHash!: string;

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
