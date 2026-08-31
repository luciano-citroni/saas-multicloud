import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
    CreateDistributionCommand,
    type CloudFrontClient,
} from '@aws-sdk/client-cloudfront';
import {
    CreateBucketCommand,
    HeadBucketCommand,
    PutBucketEncryptionCommand,
    PutBucketVersioningCommand,
    PutPublicAccessBlockCommand,
    type S3Client,
} from '@aws-sdk/client-s3';
import { AwsConnectorService } from '../../../aws/aws-connector.service';
import { ErrorMessages } from '../../../common/messages/error-messages';
import { AUTOMATION_ACTION_TYPES } from '../../constants';

export interface AwsAutomationContext {
    cloudAccountId: string;
    tenantId: string;
}

export interface ActionExecutionResult {
    output: Record<string, unknown>;
    resourceId: string | null;
}

@Injectable()
export class AwsAutomationProvider {
    private readonly logger = new Logger(AwsAutomationProvider.name);

    constructor(private readonly connector: AwsConnectorService) {}

    async executeAction(
        actionType: string,
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        switch (actionType) {
            case AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE:
                return this.createS3Bucket(config, context);
            case AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE:
                return this.createCloudFrontDistribution(config, context);
            default:
                throw new InternalServerErrorException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
        }
    }

    private async createS3Bucket(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const client: S3Client = await this.connector.getS3Client(context.cloudAccountId, context.tenantId);
        const bucketName = String(config.bucketName);
        const region = String(config.region ?? 'us-east-1');

        let alreadyExists = false;

        try {
            await client.send(new HeadBucketCommand({ Bucket: bucketName }));
            alreadyExists = true;
            this.logger.log(`S3 bucket já existe: ${bucketName}`);
        } catch {
            try {
                await client.send(
                    new CreateBucketCommand({
                        Bucket: bucketName,
                        ...(region !== 'us-east-1'
                            ? { CreateBucketConfiguration: { LocationConstraint: region as never } }
                            : {}),
                    }),
                );
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Erro desconhecido';
                if (message.includes('BucketAlreadyOwnedByYou') || message.includes('BucketAlreadyExists')) {
                    alreadyExists = true;
                } else {
                    this.logger.error(`S3 CreateBucket falhou: ${message}`);
                    throw new InternalServerErrorException(`Falha ao criar bucket S3: ${message}`);
                }
            }
        }

        if (!alreadyExists) {
            if (config.versioning) {
                await client
                    .send(
                        new PutBucketVersioningCommand({
                            Bucket: bucketName,
                            VersioningConfiguration: { Status: 'Enabled' },
                        }),
                    )
                    .catch((err: Error) => this.logger.warn(`S3 versioning falhou: ${err.message}`));
            }

            if (config.encryption !== false) {
                await client
                    .send(
                        new PutBucketEncryptionCommand({
                            Bucket: bucketName,
                            ServerSideEncryptionConfiguration: {
                                Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
                            },
                        }),
                    )
                    .catch((err: Error) => this.logger.warn(`S3 encryption falhou: ${err.message}`));
            }

            if (config.publicAccessBlock !== false) {
                await client
                    .send(
                        new PutPublicAccessBlockCommand({
                            Bucket: bucketName,
                            PublicAccessBlockConfiguration: {
                                BlockPublicAcls: true,
                                IgnorePublicAcls: true,
                                BlockPublicPolicy: true,
                                RestrictPublicBuckets: true,
                            },
                        }),
                    )
                    .catch((err: Error) => this.logger.warn(`S3 public access block falhou: ${err.message}`));
            }
        }

        const bucketArn = `arn:aws:s3:::${bucketName}`;
        const bucketDomainName =
            region === 'us-east-1' ? `${bucketName}.s3.amazonaws.com` : `${bucketName}.s3.${region}.amazonaws.com`;

        const output = {
            bucketName,
            bucketArn,
            bucketDomainName,
            alreadyExists,
        };

        return { output, resourceId: bucketName };
    }

    private async createCloudFrontDistribution(
        config: Record<string, unknown>,
        context: AwsAutomationContext,
    ): Promise<ActionExecutionResult> {
        const client: CloudFrontClient = await this.connector.getCloudFrontClient(
            context.cloudAccountId,
            context.tenantId,
        );

        const originDomainName = String(config.originDomainName ?? config.origin);
        const comment = config.comment ? String(config.comment) : 'Created by SaaS MultiCloud Automation';
        const enabled = config.enabled !== false;
        const priceClass = String(config.priceClass ?? 'PriceClass_100');

        const result = await client
            .send(
                new CreateDistributionCommand({
                    DistributionConfig: {
                        CallerReference: `${Date.now()}-${originDomainName}`,
                        Comment: comment,
                        Enabled: enabled,
                        PriceClass: priceClass as never,
                        Origins: {
                            Quantity: 1,
                            Items: [
                                {
                                    Id: 's3-origin',
                                    DomainName: originDomainName,
                                    S3OriginConfig: { OriginAccessIdentity: '' },
                                },
                            ],
                        },
                        DefaultCacheBehavior: {
                            TargetOriginId: 's3-origin',
                            ViewerProtocolPolicy: 'redirect-to-https',
                            AllowedMethods: {
                                Quantity: 2,
                                Items: ['GET', 'HEAD'],
                                CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
                            },
                            ForwardedValues: {
                                QueryString: false,
                                Cookies: { Forward: 'none' },
                            },
                            MinTTL: 0,
                            DefaultTTL: 86400,
                            MaxTTL: 31536000,
                        },
                        DefaultRootObject: 'index.html',
                    },
                }),
            )
            .catch((err: Error) => {
                this.logger.error(`CloudFront CreateDistribution falhou: ${err.message}`);
                throw new InternalServerErrorException(`Falha ao criar CloudFront: ${err.message}`);
            });

        const distribution = result.Distribution;
        const distributionId = distribution?.Id;
        const domainName = distribution?.DomainName;
        const arn = distribution?.ARN;

        if (!distributionId || !domainName) {
            throw new InternalServerErrorException('CloudFront CreateDistribution não retornou identificadores');
        }

        const output = {
            distributionId,
            domainName,
            arn: arn ?? null,
        };

        return { output, resourceId: distributionId };
    }
}
