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

@Entity('ai_finops_alerts')
@Index('IDX_ai_finops_alerts_tenant_triggered', ['tenantId', 'triggeredAt'])
@Index('UQ_ai_finops_alerts_dedupe', ['tenantId', 'alertType', 'scopeType', 'scopeId', 'dedupeKey'], {
    unique: true,
})
export class AiFinopsAlert {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 64, name: 'alert_type' })
    alertType!: string;

    @Column({ type: 'varchar', length: 32, name: 'scope_type', nullable: true })
    scopeType!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'scope_id', nullable: true })
    scopeId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'dedupe_key' })
    dedupeKey!: string;

    @Column({ type: 'text' })
    message!: string;

    @Column({ type: 'varchar', length: 32, default: 'open' })
    status!: string;

    @Column({ type: 'timestamptz', name: 'triggered_at' })
    triggeredAt!: Date;

    @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
    resolvedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
