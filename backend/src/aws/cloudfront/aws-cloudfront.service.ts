import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListDistributionsCommand, GetDistributionCommand, CloudFrontClient } from '@aws-sdk/client-cloudfront';
import type { DistributionSummary, Distribution } from '@aws-sdk/client-cloudfront';
import { AwsConnectorService } from '../aws-connector.service';
import {
    AwsCloudFrontDistribution,
    CloudFrontDistributionStatus,
    CloudFrontPriceClass,
    CloudFrontViewerProtocolPolicy,
} from '../../db/entites/aws-cloudfront-distribution.entity';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';

@Injectable()
export class CloudFrontService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsCloudFrontDistribution)
        private readonly distributionRepository: Repository<AwsCloudFrontDistribution>,
        @InjectRepository(AwsS3Bucket)
        private readonly s3Repository: Repository<AwsS3Bucket>
    ) {}

    // =========================================================================
    // Listar dados do BANCO DE DADOS (sem consultar AWS)
    // =========================================================================

    /**
     * Lista distribuições CloudFront armazenadas no banco de dados para uma CloudAccount específica.
     */
    async listDistributionsFromDatabase(cloudAccountId: string) {
        const distributions = await this.distributionRepository
            .createQueryBuilder('distribution')
            .leftJoinAndSelect('distribution.s3Bucket', 's3Bucket')
            .where('distribution.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('distribution.lastModifiedTime', 'DESC')
            .getMany();

        return distributions.map(mapDbDistribution);
    }

    /**
     * Busca uma distribuição CloudFront específica pelo ID.
     */
    async getDistributionById(distributionId: string, cloudAccountId: string) {
        const distribution = await this.distributionRepository
            .createQueryBuilder('distribution')
            .leftJoinAndSelect('distribution.s3Bucket', 's3Bucket')
            .where('distribution.id = :distributionId', { distributionId })
            .andWhere('distribution.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!distribution) {
            throw new BadRequestException(`Distribuição CloudFront com ID "${distributionId}" não encontrada.`);
        }

        return mapDbDistribution(distribution);
    }

    /**
     * Busca uma distribuição CloudFront específica pelo Distribution ID da AWS.
     */
    async getDistributionByAwsId(awsDistributionId: string, cloudAccountId: string) {
        const distribution = await this.distributionRepository
            .createQueryBuilder('distribution')
            .leftJoinAndSelect('distribution.s3Bucket', 's3Bucket')
            .where('distribution.distributionId = :awsDistributionId', { awsDistributionId })
            .andWhere('distribution.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!distribution) {
            throw new BadRequestException(`Distribuição CloudFront "${awsDistributionId}" não encontrada.`);
        }

        return mapDbDistribution(distribution);
    }

    /**
     * Lista distribuições CloudFront vinculadas a um bucket S3 específico.
     */
    async listDistributionsByS3Bucket(s3BucketId: string, cloudAccountId: string) {
        const distributions = await this.distributionRepository
            .createQueryBuilder('distribution')
            .leftJoinAndSelect('distribution.s3Bucket', 's3Bucket')
            .where('distribution.s3BucketId = :s3BucketId', { s3BucketId })
            .andWhere('distribution.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('distribution.lastModifiedTime', 'DESC')
            .getMany();

        return distributions.map(mapDbDistribution);
    }

    // =========================================================================
    // Sincronizar dados da AWS com o BANCO DE DADOS
    // =========================================================================

    /**
     * Sincroniza distribuições CloudFront da AWS e armazena no banco de dados.
     * Atualiza distribuições existentes ou cria novas.
     */
    async syncDistributionsFromAws(cloudAccountId: string, organizationId: string) {
        const cloudfront = await this.connector.getCloudFrontClient(cloudAccountId, organizationId);

        // Lista todas as distribuições
        const { DistributionList } = await cloudfront.send(new ListDistributionsCommand({})).catch(() => {
            throw new BadRequestException(
                'Falha ao consultar distribuições CloudFront na AWS. Verifique as permissões da role (cloudfront:ListDistributions).'
            );
        });

        const distributionSummaries: DistributionSummary[] = DistributionList?.Items ?? [];
        const now = new Date();

        const mappedDistributions: any[] = [];

        // Para cada distribuição, buscar detalhes completos
        for (const summary of distributionSummaries) {
            if (!summary.Id) continue;

            try {
                const { Distribution: dist } = await cloudfront.send(new GetDistributionCommand({ Id: summary.Id }));

                if (!dist) continue;

                // Tentar identificar o bucket S3 se a origem for S3
                let s3BucketId: string | null = null;
                const originDomain = dist.DistributionConfig?.Origins?.Items?.[0]?.DomainName;

                if (originDomain && originDomain.includes('.s3.')) {
                    // Extrai o nome do bucket do domínio (ex: my-bucket.s3.amazonaws.com -> my-bucket)
                    const bucketName = originDomain.split('.s3')[0];
                    const s3Bucket = await this.s3Repository.findOne({
                        where: { bucketName, cloudAccountId },
                    });
                    if (s3Bucket) {
                        s3BucketId = s3Bucket.id;
                    }
                }

                const mappedDist = {
                    cloudAccountId,
                    distributionId: dist.Id,
                    arn: dist.ARN || `arn:aws:cloudfront::${cloudAccountId}:distribution/${dist.Id}`,
                    domainName: dist.DomainName || '',
                    status: mapStatus(dist.Status),
                    enabled: dist.DistributionConfig?.Enabled ?? true,
                    comment: dist.DistributionConfig?.Comment || null,
                    priceClass: (dist.DistributionConfig?.PriceClass as CloudFrontPriceClass) || CloudFrontPriceClass.PRICE_CLASS_100,
                    aliases: dist.DistributionConfig?.Aliases?.Items || null,
                    s3BucketId,
                    originDomainName: originDomain || '',
                    originId: dist.DistributionConfig?.Origins?.Items?.[0]?.Id || '',
                    originPath: dist.DistributionConfig?.Origins?.Items?.[0]?.OriginPath || null,
                    originAccessIdentityEnabled: !!dist.DistributionConfig?.Origins?.Items?.[0]?.S3OriginConfig?.OriginAccessIdentity,
                    defaultRootObject: dist.DistributionConfig?.DefaultRootObject || null,
                    viewerProtocolPolicy:
                        (dist.DistributionConfig?.DefaultCacheBehavior?.ViewerProtocolPolicy as CloudFrontViewerProtocolPolicy) ||
                        CloudFrontViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    compress: dist.DistributionConfig?.DefaultCacheBehavior?.Compress ?? true,
                    minTTL: Number(dist.DistributionConfig?.DefaultCacheBehavior?.MinTTL || 0),
                    defaultTTL: Number(dist.DistributionConfig?.DefaultCacheBehavior?.DefaultTTL || 86400),
                    maxTTL: Number(dist.DistributionConfig?.DefaultCacheBehavior?.MaxTTL || 31536000),
                    ipv6Enabled: dist.DistributionConfig?.IsIPV6Enabled ?? true,
                    hasCustomCertificate: !!dist.DistributionConfig?.ViewerCertificate?.ACMCertificateArn,
                    certificateArn: dist.DistributionConfig?.ViewerCertificate?.ACMCertificateArn || null,
                    minimumProtocolVersion: dist.DistributionConfig?.ViewerCertificate?.MinimumProtocolVersion || null,
                    loggingEnabled: !!dist.DistributionConfig?.Logging?.Enabled,
                    loggingBucket: dist.DistributionConfig?.Logging?.Bucket || null,
                    loggingPrefix: dist.DistributionConfig?.Logging?.Prefix || null,
                    lastModifiedTime: dist.LastModifiedTime || null,
                    tags: null, // CloudFront tags requerem uma chamada separada (ListTagsForResource)
                    lastSyncedAt: now,
                };

                mappedDistributions.push(mappedDist);
            } catch (error) {
                console.error(`Erro ao buscar detalhes da distribuição ${summary.Id}:`, error);
                continue;
            }
        }

        // Insere ou atualiza no banco de dados
        for (const dist of mappedDistributions) {
            await this.distributionRepository.upsert(dist, ['distributionId']);
        }

        return {
            total: mappedDistributions.length,
            syncedAt: now,
            distributions: mappedDistributions.map(mapDbDistribution),
        };
    }
}

// =========================================================================
// Funções auxiliares de mapeamento
// =========================================================================

function mapStatus(status?: string): CloudFrontDistributionStatus {
    if (status === 'Deployed') return CloudFrontDistributionStatus.DEPLOYED;
    if (status === 'InProgress') return CloudFrontDistributionStatus.IN_PROGRESS;
    return CloudFrontDistributionStatus.DISABLED;
}

function mapDbDistribution(dist: AwsCloudFrontDistribution) {
    return {
        id: dist.id,
        cloudAccountId: dist.cloudAccountId,
        distributionId: dist.distributionId,
        arn: dist.arn,
        domainName: dist.domainName,
        status: dist.status,
        enabled: dist.enabled,
        comment: dist.comment,
        priceClass: dist.priceClass,
        aliases: dist.aliases,
        s3BucketId: dist.s3BucketId,
        s3Bucket: dist.s3Bucket
            ? {
                  id: dist.s3Bucket.id,
                  bucketName: dist.s3Bucket.bucketName,
                  region: dist.s3Bucket.region,
              }
            : null,
        originDomainName: dist.originDomainName,
        originId: dist.originId,
        originPath: dist.originPath,
        originAccessIdentityEnabled: dist.originAccessIdentityEnabled,
        defaultRootObject: dist.defaultRootObject,
        viewerProtocolPolicy: dist.viewerProtocolPolicy,
        compress: dist.compress,
        minTTL: dist.minTTL,
        defaultTTL: dist.defaultTTL,
        maxTTL: dist.maxTTL,
        ipv6Enabled: dist.ipv6Enabled,
        hasCustomCertificate: dist.hasCustomCertificate,
        certificateArn: dist.certificateArn,
        minimumProtocolVersion: dist.minimumProtocolVersion,
        loggingEnabled: dist.loggingEnabled,
        loggingBucket: dist.loggingBucket,
        loggingPrefix: dist.loggingPrefix,
        lastModifiedTime: dist.lastModifiedTime,
        tags: dist.tags,
        lastSyncedAt: dist.lastSyncedAt,
        createdAt: dist.createdAt,
        updatedAt: dist.updatedAt,
    };
}
