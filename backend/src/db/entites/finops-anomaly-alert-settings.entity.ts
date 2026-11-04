import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

import type { AnomalySeverity } from './finops-cost-anomaly.entity';

export type FinopsAnomalyAlertChannel = 'email' | 'whatsapp';

/**
 * Preferências de alerta diário de anomalias FinOps por organização.
 * Destinos reutilizam grupos do módulo de Notificações.
 */
@Entity('finops_anomaly_alert_settings')
@Index(['organizationId'], { unique: true })
export class FinopsAnomalyAlertSettings {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    @Column({ type: 'boolean', default: false })
    enabled!: boolean;

    @Column({ type: 'jsonb', name: 'alert_channels', default: '[]' })
    alertChannels!: FinopsAnomalyAlertChannel[];

    @Column({ type: 'jsonb', name: 'alert_notification_group_ids', default: '[]' })
    alertNotificationGroupIds!: string[];

    /** Severidade mínima incluída no digest (critical > high > medium > low). */
    @Column({ type: 'varchar', length: 20, name: 'min_severity', default: 'high' })
    minSeverity!: AnomalySeverity;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
