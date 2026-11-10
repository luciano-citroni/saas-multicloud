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

@Entity('ai_usage_records')
@Index('IDX_ai_usage_records_org_created', ['organizationId', 'createdAt'])
@Index('IDX_ai_usage_records_user_created', ['userId', 'createdAt'])
@Index('IDX_ai_usage_records_org_agent_created', ['organizationId', 'agentType', 'createdAt'])
export class AiUsageRecord {
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

    @Column({ type: 'varchar', length: 64 })
    provider!: string;

    @Column({ type: 'varchar', length: 128 })
    model!: string;

    @Column({ type: 'int', name: 'input_tokens', default: 0 })
    inputTokens!: number;

    @Column({ type: 'int', name: 'output_tokens', default: 0 })
    outputTokens!: number;

    @Column({ type: 'decimal', precision: 18, scale: 8, name: 'estimated_cost', default: 0 })
    estimatedCost!: number;

    @Column({ type: 'uuid', name: 'conversation_id', nullable: true })
    conversationId!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
