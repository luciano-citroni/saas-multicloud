import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

/**


 * Representa um bucket S3 sincronizado da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - O bucket está vinculado à CloudAccount da organização.


 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_s3_buckets')
export class AwsS3Bucket {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**


     * Nome do bucket na AWS (globalmente único).


     */

    @Column({ type: 'varchar', length: 255, name: 'bucket_name', unique: true })
    bucketName!: string;

    /**


     * ARN do bucket (ex: arn:aws:s3:::my-bucket).


     */

    @Column({ type: 'varchar', length: 512, name: 'bucket_arn', nullable: true })
    bucketArn!: string | null;

    /**


     * Região AWS onde o bucket está localizado.


     */

    @Column({ type: 'varchar', length: 50, name: 'region' })
    region!: string;

    /**


     * Data de criação do bucket.


     */

    @Column({ type: 'timestamp', name: 'creation_date', nullable: true })
    creationDate!: Date | null;

    /**


     * Status do versionamento do bucket (Enabled, Suspended, ou null se não configurado).


     */

    @Column({ type: 'varchar', length: 20, name: 'versioning_status', nullable: true })
    versioningStatus!: string | null;

    /**


     * Se o bucket tem criptografia padrão habilitada.


     */

    @Column({ type: 'boolean', name: 'encryption_enabled', default: false })
    encryptionEnabled!: boolean;

    /**


     * Tipo de criptografia (ex: AES256, aws:kms).


     */

    @Column({ type: 'varchar', length: 50, name: 'encryption_type', nullable: true })
    encryptionType!: string | null;

    /**


     * ID da chave KMS usada para criptografia (se applicable).


     */

    @Column({ type: 'varchar', length: 2048, name: 'kms_key_id', nullable: true })
    kmsKeyId!: string | null;

    /**


     * Se o acesso público está bloqueado (Block Public Access).


     */

    @Column({ type: 'boolean', name: 'public_access_blocked', default: true })
    publicAccessBlocked!: boolean;

    /**


     * Se o bucket tem uma política de bucket configurada.


     */

    @Column({ type: 'boolean', name: 'has_bucket_policy', default: false })
    hasBucketPolicy!: boolean;

    /**


     * Se o bucket tem replicação configurada.


     */

    @Column({ type: 'boolean', name: 'replication_enabled', default: false })
    replicationEnabled!: boolean;

    /**


     * Se o bucket tem logging configurado.


     */

    @Column({ type: 'boolean', name: 'logging_enabled', default: false })
    loggingEnabled!: boolean;

    /**


     * Bucket de destino do logging (se configurado).


     */

    @Column({ type: 'varchar', length: 255, name: 'logging_target_bucket', nullable: true })
    loggingTargetBucket!: string | null;

    /**


     * Se o bucket tem website hosting configurado.


     */

    @Column({ type: 'boolean', name: 'website_enabled', default: false })
    websiteEnabled!: boolean;

    /**


     * Documento de índice do website (ex: index.html).


     */

    @Column({ type: 'varchar', length: 255, name: 'website_index_document', nullable: true })
    websiteIndexDocument!: string | null;

    /**


     * Documento de erro do website (ex: error.html).


     */

    @Column({ type: 'varchar', length: 255, name: 'website_error_document', nullable: true })
    websiteErrorDocument!: string | null;

    /**


     * Configuração de lifecycle rules em JSON (resumo).


     */

    @Column({ type: 'jsonb', name: 'lifecycle_rules', nullable: true })
    lifecycleRules!: any | null;

    /**


     * Tags do bucket em JSON (ex: {"Environment": "production", "Project": "myapp"}).


     */

    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

    /**


     * Timestamp da última sincronização com AWS.


     */

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
