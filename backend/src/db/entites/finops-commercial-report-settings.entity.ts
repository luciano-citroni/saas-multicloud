import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('finops_commercial_report_settings')
@Index('UQ_finops_commercial_report_settings_org', ['organizationId'], { unique: true })
export class FinopsCommercialReportSettings {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'boolean', default: false })
    enabled!: boolean;

    @Column({ type: 'jsonb', default: () => "'[]'" })
    emails!: string[];

    @Column({ type: 'jsonb', name: 'alert_channels', default: () => "'[]'" })
    alertChannels!: Array<'email' | 'whatsapp'>;

    @Column({ type: 'jsonb', name: 'alert_notification_group_ids', default: () => "'[]'" })
    alertNotificationGroupIds!: string[];

    @Column({ type: 'varchar', length: 3, default: 'BRL' })
    currency!: 'USD' | 'BRL';

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
