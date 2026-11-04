import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

import type { FinopsAnomalyAlertChannel } from './finops-anomaly-alert-settings.entity';

/**
 * Digest diário já enviado — Unique (organization_id, period_key, channel).
 */
@Entity('finops_anomaly_alert_events')
@Index('UQ_finops_anomaly_alert_events_dedupe', ['organizationId', 'periodKey', 'channel'], {
    unique: true,
})
export class FinopsAnomalyAlertEvent {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** YYYY-MM-DD (UTC) do digest. */
    @Column({ type: 'varchar', length: 32, name: 'period_key' })
    periodKey!: string;

    @Column({ type: 'varchar', length: 20 })
    channel!: FinopsAnomalyAlertChannel;

    @Column({ type: 'int', name: 'anomaly_count', default: 0 })
    anomalyCount!: number;

    @Column({ type: 'timestamptz', name: 'sent_at' })
    sentAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
