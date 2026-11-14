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

export type AiFinopsLicenseType = 'seat' | 'credit_pack' | 'commitment';

@Entity('ai_finops_licenses')
@Index('IDX_ai_finops_licenses_tenant_org', ['tenantId', 'organizationId'])
@Index('IDX_ai_finops_licenses_provider', ['provider'])
export class AiFinopsLicense {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'tenant_id' })
    tenantId!: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 64 })
    provider!: string;

    @Column({ type: 'varchar', length: 32, name: 'license_type' })
    licenseType!: AiFinopsLicenseType;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
    quantity!: string;

    @Column({ type: 'decimal', precision: 18, scale: 6, name: 'unit_cost', default: 0 })
    unitCost!: string;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'timestamptz', name: 'starts_at', nullable: true })
    startsAt!: Date | null;

    @Column({ type: 'timestamptz', name: 'ends_at', nullable: true })
    endsAt!: Date | null;

    @Column({ type: 'varchar', length: 64, default: 'manual' })
    source!: string;

    /** Remaining credits when license_type is credit_pack / commitment (same unit as quantity). */
    @Column({ type: 'decimal', precision: 18, scale: 4, name: 'remaining_quantity', nullable: true })
    remainingQuantity!: string | null;

    @Column({ type: 'jsonb', default: {} })
    metadata!: Record<string, unknown>;

    @Column({ type: 'varchar', length: 32, default: 'active' })
    status!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
