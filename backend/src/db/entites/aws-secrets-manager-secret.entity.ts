import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa um secret do Secrets Manager sincronizado da Amazon Web Services.
 */
@Entity('aws_secrets_manager_secrets')
export class AwsSecretsManagerSecret {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN do secret na AWS. */
    @Column({ type: 'varchar', length: 2048, name: 'secret_arn', unique: true })
    secretArn!: string;

    /** Nome do secret. */
    @Column({ type: 'varchar', length: 512, name: 'name' })
    name!: string;

    /** Descrição do secret. */
    @Column({ type: 'varchar', length: 2048, name: 'description', nullable: true })
    description!: string | null;

    /** ARN da chave KMS usada para criptografia. */
    @Column({ type: 'varchar', length: 1024, name: 'kms_key_id', nullable: true })
    kmsKeyId!: string | null;

    /** Indica se a rotação está habilitada. */
    @Column({ type: 'boolean', name: 'rotation_enabled', default: false })
    rotationEnabled!: boolean;

    /** Dias para rotação automática. */
    @Column({ type: 'int', name: 'rotation_rules_automatically_after_days', nullable: true })
    rotationRulesAutomaticallyAfterDays!: number | null;

    /** Data da última rotação. */
    @Column({ type: 'timestamp', name: 'last_rotated_date', nullable: true })
    lastRotatedDate!: Date | null;

    /** Data do último acesso. */
    @Column({ type: 'timestamp', name: 'last_accessed_date', nullable: true })
    lastAccessedDate!: Date | null;

    /** Data de deleção agendada. */
    @Column({ type: 'timestamp', name: 'deleted_date', nullable: true })
    deletedDate!: Date | null;

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
