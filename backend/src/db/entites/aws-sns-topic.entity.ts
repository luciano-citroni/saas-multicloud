import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa um tópico SNS sincronizado da Amazon Web Services.
 */
@Entity('aws_sns_topics')
export class AwsSnsTopic {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN do tópico SNS na AWS. */
    @Column({ type: 'varchar', length: 2048, name: 'topic_arn', unique: true })
    topicArn!: string;

    /** Nome do tópico. */
    @Column({ type: 'varchar', length: 255, name: 'topic_name' })
    topicName!: string;

    /** Display name do tópico. */
    @Column({ type: 'varchar', length: 255, name: 'display_name', nullable: true })
    displayName!: string | null;

    /** Número de subscrições confirmadas. */
    @Column({ type: 'int', name: 'subscriptions_confirmed', nullable: true })
    subscriptionsConfirmed!: number | null;

    /** Número de subscrições pendentes. */
    @Column({ type: 'int', name: 'subscriptions_pending', nullable: true })
    subscriptionsPending!: number | null;

    /** Número de subscrições com entrega deletada. */
    @Column({ type: 'int', name: 'subscriptions_deleted', nullable: true })
    subscriptionsDeleted!: number | null;

    /** Indica se é FIFO. */
    @Column({ type: 'boolean', name: 'is_fifo', default: false })
    isFifo!: boolean;

    /** ARN da chave KMS para criptografia. */
    @Column({ type: 'varchar', length: 1024, name: 'kms_master_key_id', nullable: true })
    kmsMasterKeyId!: string | null;

    /** Indica se content-based deduplication está habilitado (FIFO). */
    @Column({ type: 'boolean', name: 'content_based_deduplication', default: false })
    contentBasedDeduplication!: boolean;

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
