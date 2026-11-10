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
import { User } from './user.entity';

export type AiRecommendationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AiRecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
export type AiRecommendationStatus =
    | 'NEW'
    | 'REVIEWING'
    | 'APPROVED'
    | 'REJECTED'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'FAILED'
    | 'DISMISSED';

@Entity('ai_recommendations')
@Index('IDX_ai_recommendations_org_status_created', ['organizationId', 'status', 'createdAt'])
@Index('IDX_ai_recommendations_org_category', ['organizationId', 'category'])
@Index('UQ_ai_recommendations_org_dedupe_active', ['organizationId', 'dedupeKey'], {
    unique: true,
    where: `"status" IN ('NEW', 'REVIEWING', 'APPROVED', 'EXECUTING')`,
})
export class AiRecommendation {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'user_id', nullable: true })
    userId!: string | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<User> | null;

    @Column({ type: 'varchar', length: 64, name: 'agent_type' })
    agentType!: string;

    @Column({ type: 'varchar', length: 100 })
    category!: string;

    @Column({ type: 'varchar', length: 300 })
    title!: string;

    @Column({ type: 'text' })
    description!: string;

    @Column({ type: 'varchar', length: 20, default: 'medium' })
    severity!: AiRecommendationSeverity;

    @Column({ type: 'varchar', length: 20, default: 'medium' })
    priority!: AiRecommendationPriority;

    @Column({ type: 'jsonb', default: {} })
    evidence!: Record<string, unknown>;

    @Column({ type: 'jsonb', name: 'resource_reference', nullable: true })
    resourceReference!: Record<string, unknown> | null;

    @Column({ type: 'jsonb', name: 'estimated_impact', nullable: true })
    estimatedImpact!: Record<string, unknown> | null;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    confidence!: number;

    @Column({ type: 'varchar', length: 20, default: 'NEW' })
    status!: AiRecommendationStatus;

    @Column({ type: 'varchar', length: 255, name: 'dedupe_key' })
    dedupeKey!: string;

    @Column({ type: 'uuid', name: 'assignee_user_id', nullable: true })
    assigneeUserId!: string | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'assignee_user_id' })
    assignee!: Relation<User> | null;

    @Column({ type: 'timestamptz', name: 'acknowledged_at', nullable: true })
    acknowledgedAt!: Date | null;

    @Column({ type: 'uuid', name: 'acknowledged_by_user_id', nullable: true })
    acknowledgedByUserId!: string | null;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'acknowledged_by_user_id' })
    acknowledgedBy!: Relation<User> | null;

    @Column({ type: 'varchar', length: 255, name: 'dismiss_reason', nullable: true })
    dismissReason!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
