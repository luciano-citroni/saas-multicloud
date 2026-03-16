import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

/**


 * Representa uma fila SQS sincronizada da Amazon Web Services.


 */

@Entity('aws_sqs_queues')
export class AwsSqsQueue {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** URL da fila na AWS. */

    @Column({ type: 'varchar', length: 2048, name: 'queue_url', unique: true })
    queueUrl!: string;

    /** ARN da fila na AWS. */

    @Column({ type: 'varchar', length: 2048, name: 'queue_arn', nullable: true })
    queueArn!: string | null;

    /** Nome da fila. */

    @Column({ type: 'varchar', length: 255, name: 'queue_name' })
    queueName!: string;

    /** Indica se é FIFO. */

    @Column({ type: 'boolean', name: 'is_fifo', default: false })
    isFifo!: boolean;

    /** Timeout de visibilidade em segundos. */

    @Column({ type: 'int', name: 'visibility_timeout', nullable: true })
    visibilityTimeout!: number | null;

    /** Retenção de mensagem em segundos. */

    @Column({ type: 'int', name: 'message_retention_period', nullable: true })
    messageRetentionPeriod!: number | null;

    /** Tamanho máximo de mensagem em bytes. */

    @Column({ type: 'int', name: 'maximum_message_size', nullable: true })
    maximumMessageSize!: number | null;

    /** Delay de entrega em segundos. */

    @Column({ type: 'int', name: 'delay_seconds', nullable: true })
    delaySeconds!: number | null;

    /** Número aproximado de mensagens disponíveis. */

    @Column({ type: 'int', name: 'approximate_number_of_messages', nullable: true })
    approximateNumberOfMessages!: number | null;

    /** ARN da DLQ (Dead Letter Queue). */

    @Column({ type: 'varchar', length: 2048, name: 'dead_letter_queue_arn', nullable: true })
    deadLetterQueueArn!: string | null;

    /** ARN da chave KMS para criptografia. */

    @Column({ type: 'varchar', length: 1024, name: 'kms_master_key_id', nullable: true })
    kmsMasterKeyId!: string | null;

    /** Indica se content-based deduplication está habilitado (FIFO). */

    @Column({ type: 'boolean', name: 'content_based_deduplication', default: false })
    contentBasedDeduplication!: boolean;

    /** Data de criação na AWS. */

    @Column({ type: 'timestamp', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

    /** Tags em JSON. */

    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

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
