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

@Entity('ai_daily_reports')
@Index('UQ_ai_daily_reports_org_date', ['organizationId', 'reportDate'], { unique: true })
@Index('IDX_ai_daily_reports_org_created', ['organizationId', 'createdAt'])
export class AiDailyReport {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Tenant>;

    @Column({ type: 'date', name: 'report_date' })
    reportDate!: string;

    @Column({ type: 'text' })
    summary!: string;

    @Column({ type: 'jsonb', default: {} })
    findings!: Record<string, unknown>;

    @Column({ type: 'jsonb', name: 'recommendation_ids', default: [] })
    recommendationIds!: string[];

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
