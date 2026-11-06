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

import { CloudAccount } from './cloud-account.entity';

export type FinopsCreditGrantSource = 'manual' | 'imported';

@Entity('finops_credit_grants')
@Index('UQ_finops_credit_grants_account_external', ['cloudAccountId', 'externalId'], {
    unique: true,
    where: '"external_id" IS NOT NULL',
})
export class FinopsCreditGrant {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20 })
    provider!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'decimal', precision: 18, scale: 2, name: 'total_amount' })
    totalAmount!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'date', name: 'starts_at' })
    startsAt!: string;

    @Column({ type: 'date', name: 'expires_at', nullable: true })
    expiresAt!: string | null;

    @Column({ type: 'text', nullable: true })
    notes!: string | null;

    /** Serviços cujo custo consome este crédito. Vazio quando appliesToAllServices. */
    @Column({ type: 'jsonb', default: () => "'[]'" })
    services!: string[];

    @Column({ type: 'boolean', name: 'applies_to_all_services', default: false })
    appliesToAllServices!: boolean;

    /** Id do crédito no provedor (AWS creditId). */
    @Column({ type: 'varchar', length: 128, name: 'external_id', nullable: true })
    externalId!: string | null;

    /** Saldo restante informado pelo provedor. Quando preenchido, não recalculamos pelo custo. */
    @Column({ type: 'decimal', precision: 18, scale: 2, name: 'reported_remaining', nullable: true })
    reportedRemaining!: number | null;

    /** Quanto cada serviço já consumiu, segundo o provedor. */
    @Column({ type: 'jsonb', name: 'provider_usage', nullable: true })
    providerUsage!: { service: string; amount: number }[] | null;

    @Column({ type: 'varchar', length: 20, default: 'manual' })
    source!: FinopsCreditGrantSource;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount>;
}
