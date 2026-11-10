import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('ai_org_quotas')
export class AiOrgQuota {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id', unique: true })
    organizationId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Tenant>;

    /** Null = use env default / unlimited when default also unset. */
    @Column({ type: 'int', name: 'daily_limit', nullable: true })
    dailyLimit!: number | null;

    @Column({ type: 'int', name: 'monthly_limit', nullable: true })
    monthlyLimit!: number | null;

    /** Optional per-agent monthly token caps, e.g. { cloud_advisor: 100000 }. */
    @Column({ type: 'jsonb', name: 'per_agent_limits', default: {} })
    perAgentLimits!: Record<string, number>;

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    /** basic | professional | enterprise — synced from Stripe ai_tier metadata. */
    @Column({ type: 'varchar', length: 32, nullable: true })
    tier!: string | null;

    @Column({ type: 'boolean', name: 'daily_intelligence_enabled', default: true })
    dailyIntelligenceEnabled!: boolean;

    @Column({ type: 'jsonb', name: 'notification_group_ids', default: [] })
    notificationGroupIds!: string[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
