import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa uma chave KMS sincronizada da Amazon Web Services.
 */
@Entity('aws_kms_keys')
export class AwsKmsKey {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ID da chave KMS na AWS. */
    @Column({ type: 'varchar', length: 255, name: 'aws_key_id', unique: true })
    awsKeyId!: string;

    /** ARN da chave KMS na AWS. */
    @Column({ type: 'varchar', length: 1024, name: 'key_arn' })
    keyArn!: string;

    /** Descrição da chave. */
    @Column({ type: 'varchar', length: 1024, name: 'description', nullable: true })
    description!: string | null;

    /** Estado da chave (Enabled, Disabled, PendingDeletion, PendingImport, Unavailable). */
    @Column({ type: 'varchar', length: 30, name: 'key_state', nullable: true })
    keyState!: string | null;

    /** Uso da chave (ENCRYPT_DECRYPT, SIGN_VERIFY, GENERATE_VERIFY_MAC). */
    @Column({ type: 'varchar', length: 50, name: 'key_usage', nullable: true })
    keyUsage!: string | null;

    /** Gerenciador da chave (AWS ou CUSTOMER). */
    @Column({ type: 'varchar', length: 20, name: 'key_manager', nullable: true })
    keyManager!: string | null;

    /** Spec da chave (ex: SYMMETRIC_DEFAULT, RSA_2048). */
    @Column({ type: 'varchar', length: 50, name: 'key_spec', nullable: true })
    keySpec!: string | null;

    /** Origem do material de chave (AWS_KMS, EXTERNAL, AWS_CLOUDHSM). */
    @Column({ type: 'varchar', length: 30, name: 'origin', nullable: true })
    origin!: string | null;

    /** Indica se a rotação automática está habilitada. */
    @Column({ type: 'boolean', name: 'key_rotation_enabled', nullable: true })
    keyRotationEnabled!: boolean | null;

    /** Data de criação na AWS. */
    @Column({ type: 'timestamp', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

    /** Data de deleção agendada (se PendingDeletion). */
    @Column({ type: 'timestamp', name: 'deletion_date', nullable: true })
    deletionDate!: Date | null;

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
