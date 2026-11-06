import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('finops_commercial_report_sends')
@Index('UQ_finops_commercial_report_sends_org_month', ['organizationId', 'month'], { unique: true })
export class FinopsCommercialReportSend {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** Mês de referência fechado, no formato YYYY-MM. */
    @Column({ type: 'varchar', length: 7 })
    month!: string;

    @Column({ type: 'timestamptz', name: 'sent_at' })
    sentAt!: Date;

    @Column({ type: 'int', name: 'recipient_count', default: 0 })
    recipientCount!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
