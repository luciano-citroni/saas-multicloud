import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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
    type Bucket,
    type S3Client,
} from '@aws-sdk/client-s3';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';
import { paginateQuery, type PaginationInput } from '../../common/pagination/paginate';

@Injectable()
export class S3Service {
    private readonly logger = new Logger(S3Service.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsS3Bucket)
        private readonly s3Repository: Repository<AwsS3Bucket>,
    ) {}

    async listBucketsFromDatabase(cloudAccountId: string, pagination: PaginationInput = {}) {
        const qb = this.s3Repository
            .createQueryBuilder('bucket')
            .where('bucket.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('bucket.creationDate', 'DESC');
        const result = await paginateQuery(qb, pagination);
        return { items: result.items.map(mapDbBucket), pagination: result.pagination };
    }

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

    /**
     * Sincroniza buckets S3 da AWS e armazena no banco de dados.
     * Uses a regional S3 client per bucket so Public Access Block / encryption reads
     * do not fail with PermanentRedirect and get misclassified as "public".
     */
    async syncBucketsFromAws(cloudAccountId: string, organizationId: string) {
        const listClient = await this.connector.getS3Client(cloudAccountId, organizationId);

        const { Buckets } = await listClient.send(new ListBucketsCommand({})).catch(() => {
            throw new BadRequestException(
                'Falha ao consultar buckets S3 na AWS. Verifique as permissões da role (s3:ListAllMyBuckets).',
            );
        });

        const bucketList: Bucket[] = Buckets ?? [];
        const now = new Date();
        const mappedBuckets: Array<Record<string, unknown>> = [];
        const regionalClients = new Map<string, S3Client>();

        const getRegionalClient = async (region: string): Promise<S3Client> => {
            const cached = regionalClients.get(region);
            if (cached) return cached;
            const client = await this.connector.getS3Client(cloudAccountId, organizationId, region);
            regionalClients.set(region, client);
            return client;
        };

        for (const bucket of bucketList) {
            if (!bucket.Name) continue;

            try {
                const { LocationConstraint } = await listClient
                    .send(new GetBucketLocationCommand({ Bucket: bucket.Name }))
                    .catch(() => ({ LocationConstraint: undefined as string | undefined }));

                const region = normalizeBucketRegion(LocationConstraint);
                const s3 = await getRegionalClient(region);
                const bucketArn = `arn:aws:s3:::${bucket.Name}`;

                const versioningStatus = await s3
                    .send(new GetBucketVersioningCommand({ Bucket: bucket.Name }))
                    .then((res) => res.Status || null)
                    .catch(() => null);

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
                } catch {
                    // No default encryption configured
                }

                const publicAccess = await this.resolvePublicAccessBlocked(s3, bucket.Name);

                let hasBucketPolicy = false;
                try {
                    await s3.send(new GetBucketPolicyCommand({ Bucket: bucket.Name }));
                    hasBucketPolicy = true;
                } catch {
                    // No bucket policy
                }

                let replicationEnabled = false;
                try {
                    const replication = await s3.send(new GetBucketReplicationCommand({ Bucket: bucket.Name }));
                    replicationEnabled = !!replication.ReplicationConfiguration?.Rules?.length;
                } catch {
                    // No replication
                }

                let loggingEnabled = false;
                let loggingTargetBucket: string | null = null;
                try {
                    const logging = await s3.send(new GetBucketLoggingCommand({ Bucket: bucket.Name }));
                    if (logging.LoggingEnabled?.TargetBucket) {
                        loggingEnabled = true;
                        loggingTargetBucket = logging.LoggingEnabled.TargetBucket;
                    }
                } catch {
                    // No logging
                }

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
                } catch {
                    // No website hosting
                }

                let lifecycleRules: Record<string, unknown> | null = null;
                try {
                    const lifecycle = await s3.send(
                        new GetBucketLifecycleConfigurationCommand({ Bucket: bucket.Name }),
                    );
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
                } catch {
                    // No lifecycle
                }

                let tags: Record<string, string> = {};
                try {
                    const tagging = await s3.send(new GetBucketTaggingCommand({ Bucket: bucket.Name }));
                    tags = parseTags(tagging.TagSet);
                } catch {
                    // No tags
                }

                let dbBucket = await this.s3Repository.findOne({
                    where: { bucketName: bucket.Name },
                });

                // Prefer the live AWS read. If BPA cannot be resolved, default to blocked=true —
                // never keep a stale `false` from a previous failed sync (that caused false
                // "public bucket" governance findings for buckets that are actually blocked).
                const publicAccessBlocked = publicAccess.resolved ? publicAccess.blocked : true;

                if (!publicAccess.resolved) {
                    this.logger.warn(
                        `Could not resolve Public Access Block for s3://${bucket.Name} (${region}); defaulting publicAccessBlocked=true to avoid false positives`,
                    );
                } else {
                    this.logger.debug(
                        `Public Access Block for s3://${bucket.Name}: blocked=${publicAccessBlocked}`,
                    );
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

                if (dbBucket) {
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
                    dbBucket = this.s3Repository.create({
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
                    } as Partial<AwsS3Bucket>);
                }

                await this.s3Repository.save(dbBucket);
            } catch (error) {
                this.logger.warn(`Erro ao sincronizar bucket ${bucket.Name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return mappedBuckets;
    }

    /**
     * Only treat NoSuchPublicAccessBlockConfiguration as "BPA not configured".
     * Other errors (AccessDenied, redirect, throttling) must not be stored as public=false.
     */
    private async resolvePublicAccessBlocked(
        s3: S3Client,
        bucketName: string,
    ): Promise<{ resolved: boolean; blocked: boolean }> {
        try {
            const publicAccess = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucketName }));
            const config = publicAccess.PublicAccessBlockConfiguration;
            const blocked = !!(
                config?.BlockPublicAcls &&
                config?.BlockPublicPolicy &&
                config?.IgnorePublicAcls &&
                config?.RestrictPublicBuckets
            );
            return { resolved: true, blocked };
        } catch (error) {
            if (isNoSuchPublicAccessBlockConfiguration(error)) {
                return { resolved: true, blocked: false };
            }

            this.logger.warn(
                `GetPublicAccessBlock failed for s3://${bucketName}: ${awsErrorMessage(error)}`,
            );
            return { resolved: false, blocked: true };
        }
    }
}

function normalizeBucketRegion(locationConstraint: string | undefined | null): string {
    if (!locationConstraint) return 'us-east-1';
    // Legacy AWS location constraint
    if (locationConstraint === 'EU') return 'eu-west-1';
    return locationConstraint;
}

function isNoSuchPublicAccessBlockConfiguration(error: unknown): boolean {
    const err = error as {
        name?: string;
        Code?: string;
        code?: string;
        message?: string;
    } | null;
    const code = `${err?.name ?? ''} ${err?.Code ?? ''} ${err?.code ?? ''} ${err?.message ?? ''}`;
    return code.includes('NoSuchPublicAccessBlockConfiguration');
}

function awsErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

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
