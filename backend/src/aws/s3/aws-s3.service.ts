import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import {
    ListBucketsCommand,
    GetBucketVersioningCommand,
    GetBucketEncryptionCommand,
    GetPublicAccessBlockCommand,
    GetBucketPolicyCommand,
    GetBucketReplicationCommand,
    GetBucketLoggingCommand,
    GetBucketWebsiteCommand,
    GetBucketLifecycleConfigurationCommand,
    GetBucketTaggingCommand,
    GetBucketLocationCommand,
} from '@aws-sdk/client-s3';

import type { Bucket } from '@aws-sdk/client-s3';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';

@Injectable()
export class S3Service {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsS3Bucket)
        private readonly s3Repository: Repository<AwsS3Bucket>
    ) {}

    // =========================================================================

    // Listar dados do BANCO DE DADOS (sem consultar AWS)

    // =========================================================================

    /**


     * Lista buckets S3 armazenados no banco de dados para uma CloudAccount específica.


     */

    async listBucketsFromDatabase(cloudAccountId: string) {
        const buckets = await this.s3Repository

            .createQueryBuilder('bucket')

            .where('bucket.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .orderBy('bucket.creationDate', 'DESC')

            .getMany();

        return buckets.map(mapDbBucket);
    }

    /**


     * Busca um bucket S3 específico pelo ID.


     */

    async getBucketById(bucketId: string, cloudAccountId: string) {
        const bucket = await this.s3Repository

            .createQueryBuilder('bucket')

            .where('bucket.id = :bucketId', { bucketId })

            .andWhere('bucket.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .getOne();

        if (!bucket) {
            throw new BadRequestException(`Bucket S3 com ID "${bucketId}" não encontrado.`);
        }

        return mapDbBucket(bucket);
    }

    /**


     * Busca um bucket S3 específico pelo nome.


     */

    async getBucketByName(bucketName: string, cloudAccountId: string) {
        const bucket = await this.s3Repository

            .createQueryBuilder('bucket')

            .where('bucket.bucketName = :bucketName', { bucketName })

            .andWhere('bucket.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .getOne();

        if (!bucket) {
            throw new BadRequestException(`Bucket S3 "${bucketName}" não encontrado.`);
        }

        return mapDbBucket(bucket);
    }

    // =========================================================================

    // Sincronizar dados da AWS com o BANCO DE DADOS

    // =========================================================================

    /**


     * Sincroniza buckets S3 da AWS e armazena no banco de dados.


     * Atualiza buckets existentes ou cria novos.


     */

    async syncBucketsFromAws(cloudAccountId: string, organizationId: string) {
        const s3 = await this.connector.getS3Client(cloudAccountId, organizationId);

        // Lista todos os buckets

        const { Buckets } = await s3.send(new ListBucketsCommand({})).catch(() => {
            throw new BadRequestException('Falha ao consultar buckets S3 na AWS. Verifique as permissões da role (s3:ListAllMyBuckets).');
        });

        const bucketList: Bucket[] = Buckets ?? [];

        const now = new Date();

        const mappedBuckets: any[] = [];

        for (const bucket of bucketList) {
            if (!bucket.Name) continue;

            try {
                // Obter região do bucket

                const { LocationConstraint } = await s3

                    .send(new GetBucketLocationCommand({ Bucket: bucket.Name }))

                    .catch(() => ({ LocationConstraint: undefined }));

                const region = LocationConstraint || 'us-east-1';

                const bucketArn = `arn:aws:s3:::${bucket.Name}`;

                // Obter configuração de versionamento

                const versioningStatus = await s3

                    .send(new GetBucketVersioningCommand({ Bucket: bucket.Name }))

                    .then((res) => res.Status || null)

                    .catch(() => null);

                // Obter configuração de criptografia

                let encryptionEnabled = false;

                let encryptionType: string | null = null;

                let kmsKeyId: string | null = null;

                try {
                    const encryption = await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));

                    if (encryption.ServerSideEncryptionConfiguration?.Rules?.[0]) {
                        encryptionEnabled = true;

                        const rule = encryption.ServerSideEncryptionConfiguration.Rules[0];

                        encryptionType = rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm || null;

                        kmsKeyId = rule.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID || null;
                    }
                } catch (e) {
                    // Sem criptografia configurada
                }

                // Obter configuração de acesso público

                let publicAccessBlocked = true;

                try {
                    const publicAccess = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket.Name }));

                    const config = publicAccess.PublicAccessBlockConfiguration;

                    publicAccessBlocked = !!(
                        config?.BlockPublicAcls &&
                        config?.BlockPublicPolicy &&
                        config?.IgnorePublicAcls &&
                        config?.RestrictPublicBuckets
                    );
                } catch (e) {
                    // Configuração padrão: sem bloqueio público (considerar como não bloqueado)

                    publicAccessBlocked = false;
                }

                // Verificar se tem política de bucket

                let hasBucketPolicy = false;

                try {
                    await s3.send(new GetBucketPolicyCommand({ Bucket: bucket.Name }));

                    hasBucketPolicy = true;
                } catch (e) {
                    // Sem política
                }

                // Verificar se tem replicação

                let replicationEnabled = false;

                try {
                    const replication = await s3.send(new GetBucketReplicationCommand({ Bucket: bucket.Name }));

                    replicationEnabled = !!replication.ReplicationConfiguration?.Rules?.length;
                } catch (e) {
                    // Sem replicação
                }

                // Verificar configuração de logging

                let loggingEnabled = false;

                let loggingTargetBucket: string | null = null;

                try {
                    const logging = await s3.send(new GetBucketLoggingCommand({ Bucket: bucket.Name }));

                    if (logging.LoggingEnabled?.TargetBucket) {
                        loggingEnabled = true;

                        loggingTargetBucket = logging.LoggingEnabled.TargetBucket;
                    }
                } catch (e) {
                    // Sem logging
                }

                // Verificar configuração de website

                let websiteEnabled = false;

                let websiteIndexDocument: string | null = null;

                let websiteErrorDocument: string | null = null;

                try {
                    const website = await s3.send(new GetBucketWebsiteCommand({ Bucket: bucket.Name }));

                    if (website.IndexDocument?.Suffix) {
                        websiteEnabled = true;

                        websiteIndexDocument = website.IndexDocument.Suffix;

                        websiteErrorDocument = website.ErrorDocument?.Key || null;
                    }
                } catch (e) {
                    // Sem website
                }

                // Obter lifecycle rules (apenas resumo - quantidade de rules)

                let lifecycleRules: any = null;

                try {
                    const lifecycle = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket.Name }));

                    if (lifecycle.Rules?.length) {
                        lifecycleRules = {
                            count: lifecycle.Rules.length,

                            rules: lifecycle.Rules.map((rule) => ({
                                id: rule.ID || 'unnamed',

                                status: rule.Status,

                                transitions: rule.Transitions?.length || 0,

                                expirationDays: rule.Expiration?.Days || null,
                            })),
                        };
                    }
                } catch (e) {
                    // Sem lifecycle
                }

                // Obter tags

                let tags: Record<string, string> = {};

                try {
                    const tagging = await s3.send(new GetBucketTaggingCommand({ Bucket: bucket.Name }));

                    tags = parseTags(tagging.TagSet);
                } catch (e) {
                    // Sem tags
                }

                const bucketData = {
                    bucketName: bucket.Name,

                    bucketArn,

                    region,

                    creationDate: bucket.CreationDate || null,

                    versioningStatus,

                    encryptionEnabled,

                    encryptionType,

                    kmsKeyId,

                    publicAccessBlocked,

                    hasBucketPolicy,

                    replicationEnabled,

                    loggingEnabled,

                    loggingTargetBucket,

                    websiteEnabled,

                    websiteIndexDocument,

                    websiteErrorDocument,

                    lifecycleRules,

                    tags,
                };

                mappedBuckets.push(bucketData);

                // Verifica se bucket já existe no banco

                let dbBucket = await this.s3Repository.findOne({
                    where: { bucketName: bucket.Name },
                });

                if (dbBucket) {
                    // Atualiza bucket existente

                    dbBucket.bucketArn = bucketArn;

                    dbBucket.region = region;

                    dbBucket.creationDate = bucket.CreationDate || null;

                    dbBucket.versioningStatus = versioningStatus;

                    dbBucket.encryptionEnabled = encryptionEnabled;

                    dbBucket.encryptionType = encryptionType;

                    dbBucket.kmsKeyId = kmsKeyId;

                    dbBucket.publicAccessBlocked = publicAccessBlocked;

                    dbBucket.hasBucketPolicy = hasBucketPolicy;

                    dbBucket.replicationEnabled = replicationEnabled;

                    dbBucket.loggingEnabled = loggingEnabled;

                    dbBucket.loggingTargetBucket = loggingTargetBucket;

                    dbBucket.websiteEnabled = websiteEnabled;

                    dbBucket.websiteIndexDocument = websiteIndexDocument;

                    dbBucket.websiteErrorDocument = websiteErrorDocument;

                    dbBucket.lifecycleRules = lifecycleRules;

                    dbBucket.tags = tags;

                    dbBucket.lastSyncedAt = now;
                } else {
                    // Cria novo bucket

                    const newBucket: Partial<AwsS3Bucket> = {
                        cloudAccountId,

                        bucketName: bucket.Name,

                        bucketArn,

                        region,

                        creationDate: bucket.CreationDate || null,

                        versioningStatus,

                        encryptionEnabled,

                        encryptionType,

                        kmsKeyId,

                        publicAccessBlocked,

                        hasBucketPolicy,

                        replicationEnabled,

                        loggingEnabled,

                        loggingTargetBucket,

                        websiteEnabled,

                        websiteIndexDocument,

                        websiteErrorDocument,

                        lifecycleRules,

                        tags,

                        lastSyncedAt: now,
                    };

                    dbBucket = this.s3Repository.create(newBucket);
                }

                await this.s3Repository.save(dbBucket);
            } catch (error) {
                console.warn(`Erro ao sincronizar bucket ${bucket.Name}:`, error);

                // Continua para o próximo bucket
            }
        }

        return mappedBuckets;
    }
}

// ---------------------------------------------------------------------------

// Mappers

// ---------------------------------------------------------------------------

function parseTags(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
    return (tags ?? []).reduce<Record<string, string>>((acc, { Key, Value }) => {
        if (Key) acc[Key] = Value ?? '';

        return acc;
    }, {});
}

function mapDbBucket(bucket: AwsS3Bucket) {
    return {
        id: bucket.id,

        cloudAccountId: bucket.cloudAccountId,

        bucketName: bucket.bucketName,

        bucketArn: bucket.bucketArn,

        region: bucket.region,

        creationDate: bucket.creationDate,

        versioningStatus: bucket.versioningStatus,

        encryptionEnabled: bucket.encryptionEnabled,

        encryptionType: bucket.encryptionType,

        kmsKeyId: bucket.kmsKeyId,

        publicAccessBlocked: bucket.publicAccessBlocked,

        hasBucketPolicy: bucket.hasBucketPolicy,

        replicationEnabled: bucket.replicationEnabled,

        loggingEnabled: bucket.loggingEnabled,

        loggingTargetBucket: bucket.loggingTargetBucket,

        websiteEnabled: bucket.websiteEnabled,

        websiteIndexDocument: bucket.websiteIndexDocument,

        websiteErrorDocument: bucket.websiteErrorDocument,

        lifecycleRules: bucket.lifecycleRules,

        tags: bucket.tags ?? {},

        lastSyncedAt: bucket.lastSyncedAt,
    };
}
