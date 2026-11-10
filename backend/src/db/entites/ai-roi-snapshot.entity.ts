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

@Entity('ai_roi_snapshots')
@Index('UQ_ai_roi_snapshots_org_period', ['organizationId', 'periodStart', 'periodEnd'], {
    unique: true,
})
export class AiRoiSnapshot {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Relation<Tenant>;

    @Column({ type: 'date', name: 'period_start' })
    periodStart!: string;

    @Column({ type: 'date', name: 'period_end' })
    periodEnd!: string;

    @Column({ type: 'numeric', precision: 14, scale: 2, name: 'potential_saving', default: 0 })
    potentialSaving!: number;

    @Column({ type: 'numeric', precision: 14, scale: 2, name: 'completed_saving', default: 0 })
    completedSaving!: number;

    @Column({ type: 'int', name: 'completed_count', default: 0 })
    completedCount!: number;

    @Column({ type: 'int', name: 'pending_count', default: 0 })
    pendingCount!: number;

    @Column({ type: 'varchar', length: 8, default: 'USD' })
    currency!: string;

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
