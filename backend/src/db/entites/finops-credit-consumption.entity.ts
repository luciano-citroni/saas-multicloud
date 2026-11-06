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

@Entity('finops_credit_consumptions')
@Index('UQ_finops_credit_consumptions_upsert', ['cloudAccountId', 'date', 'label', 'currency'], {
    unique: true,
})
export class FinopsCreditConsumption {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'varchar', length: 20 })
    provider!: string;

    /** Valor positivo = crédito consumido (absoluto do valor negativo da fatura). */
    @Column({ type: 'decimal', precision: 18, scale: 4 })
    amount!: number;

    @Column({ type: 'varchar', length: 10, default: 'USD' })
    currency!: string;

    @Column({ type: 'date' })
    date!: string;

    /** Ex.: Credit, Refund, SERVICE name, credit type GCP. */
    @Column({ type: 'varchar', length: 255 })
    label!: string;

    @Column({ type: 'jsonb', name: 'raw_metadata', nullable: true })
    rawMetadata!: Record<string, unknown> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: Relation<CloudAccount>;
}
