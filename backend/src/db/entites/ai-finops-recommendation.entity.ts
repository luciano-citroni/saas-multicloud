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

@Entity('ai_finops_recommendations')
@Index('IDX_ai_finops_recommendations_tenant_status', ['tenantId', 'status'])
export class AiFinopsRecommendation {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 255 })
    title!: string;

    @Column({ type: 'text' })
    description!: string;

    @Column({ type: 'decimal', precision: 18, scale: 4, name: 'estimated_impact', nullable: true })
    estimatedImpact!: string | null;

    @Column({ type: 'varchar', length: 10, name: 'impact_currency', default: 'USD' })
    impactCurrency!: string;

    @Column({ type: 'text' })
    rationale!: string;

    @Column({ type: 'varchar', length: 64, name: 'entity_type', nullable: true })
    entityType!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'entity_id', nullable: true })
    entityId!: string | null;

    @Column({ type: 'text', name: 'suggested_action', nullable: true })
    suggestedAction!: string | null;

    @Column({ type: 'varchar', length: 32, default: 'open' })
    status!: string;

    @Column({ type: 'timestamptz', name: 'identified_at' })
    identifiedAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
