import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

/**


 * Representa um alarme do CloudWatch sincronizado da Amazon Web Services.


 */

@Entity('aws_cloudwatch_alarms')
export class AwsCloudWatchAlarm {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN do alarme na AWS. */

    @Column({ type: 'varchar', length: 1024, name: 'alarm_arn', unique: true })
    alarmArn!: string;

    /** Nome do alarme. */

    @Column({ type: 'varchar', length: 255, name: 'alarm_name' })
    alarmName!: string;

    /** Descrição do alarme. */

    @Column({ type: 'varchar', length: 1024, name: 'alarm_description', nullable: true })
    alarmDescription!: string | null;

    /** Estado atual do alarme (OK, ALARM, INSUFFICIENT_DATA). */

    @Column({ type: 'varchar', length: 30, name: 'state_value' })
    stateValue!: string;

    /** Razão do estado atual. */

    @Column({ type: 'varchar', length: 1024, name: 'state_reason', nullable: true })
    stateReason!: string | null;

    /** Namespace da métrica (ex: AWS/EC2). */

    @Column({ type: 'varchar', length: 255, name: 'namespace', nullable: true })
    namespace!: string | null;

    /** Nome da métrica monitorada. */

    @Column({ type: 'varchar', length: 255, name: 'metric_name', nullable: true })
    metricName!: string | null;

    /** Operador de comparação (ex: GreaterThanThreshold). */

    @Column({ type: 'varchar', length: 64, name: 'comparison_operator', nullable: true })
    comparisonOperator!: string | null;

    /** Threshold do alarme. */

    @Column({ type: 'float', name: 'threshold', nullable: true })
    threshold!: number | null;

    /** Período de avaliação em segundos. */

    @Column({ type: 'int', name: 'period', nullable: true })
    period!: number | null;

    /** Número de períodos de avaliação. */

    @Column({ type: 'int', name: 'evaluation_periods', nullable: true })
    evaluationPeriods!: number | null;

    /** Statistic (Average, Sum, Maximum, etc). */

    @Column({ type: 'varchar', length: 30, name: 'statistic', nullable: true })
    statistic!: string | null;

    /** Ações a executar quando o alarme dispara (ARNs de SNS). */

    @Column({ type: 'jsonb', name: 'alarm_actions', nullable: true })
    alarmActions!: string[] | null;

    /** Dimensões da métrica em JSON. */

    @Column({ type: 'jsonb', name: 'dimensions', nullable: true })
    dimensions!: Record<string, string>[] | null;

    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;
}
