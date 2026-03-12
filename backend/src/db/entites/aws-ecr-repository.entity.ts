import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';

/**
 * Representa um repositório ECR sincronizado da Amazon Web Services.
 */
@Entity('aws_ecr_repositories')
export class AwsEcrRepository {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN do repositório ECR na AWS. */
    @Column({ type: 'varchar', length: 1024, name: 'repository_arn', unique: true })
    repositoryArn!: string;

    /** Nome do repositório. */
    @Column({ type: 'varchar', length: 255, name: 'repository_name' })
    repositoryName!: string;

    /** URI do repositório (ex: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo). */
    @Column({ type: 'varchar', length: 1024, name: 'repository_uri', nullable: true })
    repositoryUri!: string | null;

    /** ID do registry. */
    @Column({ type: 'varchar', length: 50, name: 'registry_id', nullable: true })
    registryId!: string | null;

    /** Mutabilidade das tags (MUTABLE, IMMUTABLE). */
    @Column({ type: 'varchar', length: 20, name: 'image_tag_mutability', nullable: true })
    imageTagMutability!: string | null;

    /** Indica se o scan na hora do push está ativado. */
    @Column({ type: 'boolean', name: 'scan_on_push', default: false })
    scanOnPush!: boolean;

    /** Tipo de criptografia (AES256, KMS). */
    @Column({ type: 'varchar', length: 10, name: 'encryption_type', nullable: true })
    encryptionType!: string | null;

    /** ARN da chave KMS para criptografia. */
    @Column({ type: 'varchar', length: 1024, name: 'encryption_kms_key', nullable: true })
    encryptionKmsKey!: string | null;

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
