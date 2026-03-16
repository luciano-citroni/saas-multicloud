import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsS3Bucket } from './aws-s3-bucket.entity';

/**


 * Status da distribuição CloudFront.


 */

export enum CloudFrontDistributionStatus {
    DEPLOYED = 'Deployed',

    IN_PROGRESS = 'InProgress',

    DISABLED = 'Disabled',
}

/**


 * Classe de preço da distribuição CloudFront.


 */

export enum CloudFrontPriceClass {
    PRICE_CLASS_100 = 'PriceClass_100',

    PRICE_CLASS_200 = 'PriceClass_200',

    PRICE_CLASS_ALL = 'PriceClass_All',
}

/**


 * Protocolo de visualização permitido.


 */

export enum CloudFrontViewerProtocolPolicy {
    ALLOW_ALL = 'allow-all',

    HTTPS_ONLY = 'https-only',

    REDIRECT_TO_HTTPS = 'redirect-to-https',
}

/**


 * Representa uma distribuição CloudFront sincronizada da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - A distribuição está vinculada à CloudAccount da organização.


 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_cloudfront_distributions')
export class AwsCloudFrontDistribution {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**


     * ID da distribuição na AWS (ex: E1234567890ABC).


     */

    @Column({ type: 'varchar', length: 255, name: 'distribution_id', unique: true })
    distributionId!: string;

    /**


     * ARN da distribuição (ex: arn:aws:cloudfront::123456789012:distribution/E1234567890ABC).


     */

    @Column({ type: 'varchar', length: 512, name: 'arn' })
    arn!: string;

    /**


     * Nome de domínio da distribuição (ex: d111111abcdef8.cloudfront.net).


     */

    @Column({ type: 'varchar', length: 512, name: 'domain_name' })
    domainName!: string;

    /**


     * Status da distribuição (Deployed, InProgress, Disabled).


     */

    @Column({
        type: 'varchar',

        length: 50,

        name: 'status',

        default: CloudFrontDistributionStatus.IN_PROGRESS,
    })
    status!: CloudFrontDistributionStatus;

    /**


     * Se a distribuição está habilitada.


     */

    @Column({ type: 'boolean', name: 'enabled', default: true })
    enabled!: boolean;

    /**


     * Comentário/descrição da distribuição.


     */

    @Column({ type: 'text', name: 'comment', nullable: true })
    comment!: string | null;

    /**


     * Classe de preço (PriceClass_100, PriceClass_200, PriceClass_All).


     */

    @Column({
        type: 'varchar',

        length: 50,

        name: 'price_class',

        default: CloudFrontPriceClass.PRICE_CLASS_100,
    })
    priceClass!: CloudFrontPriceClass;

    /**


     * CNAMEs alternativos (aliases) da distribuição.


     */

    @Column({ type: 'jsonb', name: 'aliases', nullable: true })
    aliases!: string[] | null;

    /**


     * ID do bucket S3 usado como origem (se aplicável).


     */

    @Column({ type: 'uuid', name: 's3_bucket_id', nullable: true })
    s3BucketId!: string | null;

    /**


     * Nome do domínio de origem (ex: my-bucket.s3.amazonaws.com).


     */

    @Column({ type: 'varchar', length: 512, name: 'origin_domain_name' })
    originDomainName!: string;

    /**


     * ID da origem.


     */

    @Column({ type: 'varchar', length: 255, name: 'origin_id' })
    originId!: string;

    /**


     * Path da origem (ex: /production).


     */

    @Column({ type: 'varchar', length: 512, name: 'origin_path', nullable: true })
    originPath!: string | null;

    /**


     * Se a origem usa Origin Access Identity (OAI) para S3.


     */

    @Column({ type: 'boolean', name: 'origin_access_identity_enabled', default: false })
    originAccessIdentityEnabled!: boolean;

    /**


     * Caminho do objeto raiz padrão (ex: index.html).


     */

    @Column({ type: 'varchar', length: 255, name: 'default_root_object', nullable: true })
    defaultRootObject!: string | null;

    /**


     * Política de protocolo do visualizador (allow-all, https-only, redirect-to-https).


     */

    @Column({
        type: 'varchar',

        length: 50,

        name: 'viewer_protocol_policy',

        default: CloudFrontViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    })
    viewerProtocolPolicy!: CloudFrontViewerProtocolPolicy;

    /**


     * Se a compressão está habilitada.


     */

    @Column({ type: 'boolean', name: 'compress', default: true })
    compress!: boolean;

    /**


     * TTL mínimo do cache (em segundos).


     */

    @Column({ type: 'bigint', name: 'min_ttl', default: 0 })
    minTTL!: number;

    /**


     * TTL padrão do cache (em segundos).


     */

    @Column({ type: 'bigint', name: 'default_ttl', default: 86400 })
    defaultTTL!: number;

    /**


     * TTL máximo do cache (em segundos).


     */

    @Column({ type: 'bigint', name: 'max_ttl', default: 31536000 })
    maxTTL!: number;

    /**


     * Se o IPv6 está habilitado.


     */

    @Column({ type: 'boolean', name: 'ipv6_enabled', default: true })
    ipv6Enabled!: boolean;

    /**


     * Se a distribuição tem certificado SSL/TLS customizado.


     */

    @Column({ type: 'boolean', name: 'has_custom_certificate', default: false })
    hasCustomCertificate!: boolean;

    /**


     * ARN do certificado ACM (se aplicável).


     */

    @Column({ type: 'varchar', length: 512, name: 'certificate_arn', nullable: true })
    certificateArn!: string | null;

    /**


     * Versão mínima do protocolo TLS.


     */

    @Column({ type: 'varchar', length: 50, name: 'minimum_protocol_version', nullable: true })
    minimumProtocolVersion!: string | null;

    /**


     * Se o logging está habilitado.


     */

    @Column({ type: 'boolean', name: 'logging_enabled', default: false })
    loggingEnabled!: boolean;

    /**


     * Bucket de destino do logging.


     */

    @Column({ type: 'varchar', length: 255, name: 'logging_bucket', nullable: true })
    loggingBucket!: string | null;

    /**


     * Prefixo do logging.


     */

    @Column({ type: 'varchar', length: 255, name: 'logging_prefix', nullable: true })
    loggingPrefix!: string | null;

    /**


     * Data da última modificação da distribuição.


     */

    @Column({ type: 'timestamp', name: 'last_modified_time', nullable: true })
    lastModifiedTime!: Date | null;

    /**


     * Tags da distribuição em JSON (ex: {"Environment": "production"}).


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

    @ManyToOne(() => AwsS3Bucket, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 's3_bucket_id' })
    s3Bucket!: AwsS3Bucket | null;
}
