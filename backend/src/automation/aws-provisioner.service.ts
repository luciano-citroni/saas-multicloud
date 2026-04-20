import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { RunInstancesCommand, type EC2Client } from '@aws-sdk/client-ec2';
import { CreateBucketCommand, PutBucketVersioningCommand, PutBucketEncryptionCommand, type S3Client } from '@aws-sdk/client-s3';
import { CreateDBInstanceCommand, type RDSClient } from '@aws-sdk/client-rds';
import { CreateFunctionCommand, type LambdaClient, PackageType } from '@aws-sdk/client-lambda';
import { AwsConnectorService } from '../aws/aws-connector.service';
import { ErrorMessages } from '../common/messages/error-messages';

export interface ProvisionResult {
    awsResourceId: string;
}

@Injectable()
export class AwsProvisionerService {
    private readonly logger = new Logger(AwsProvisionerService.name);

    constructor(private readonly connector: AwsConnectorService) {}

    async provisionNode(
        nodeType: string,
        config: Record<string, unknown>,
        cloudAccountId: string,
        organizationId: string,
    ): Promise<ProvisionResult> {
        switch (nodeType) {
            case 'ec2':
                return this.provisionEc2(config, cloudAccountId, organizationId);
            case 's3':
                return this.provisionS3(config, cloudAccountId, organizationId);
            case 'rds':
                return this.provisionRds(config, cloudAccountId, organizationId);
            case 'lambda':
                return this.provisionLambda(config, cloudAccountId, organizationId);
            default:
                throw new InternalServerErrorException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
        }
    }

    private async provisionEc2(
        config: Record<string, unknown>,
        cloudAccountId: string,
        organizationId: string,
    ): Promise<ProvisionResult> {
        const client: EC2Client = await this.connector.getEc2Client(cloudAccountId, organizationId);

        const diskType = config.diskType ? String(config.diskType) : 'gp3';
        const diskSizeGb = typeof config.diskSizeGb === 'number' ? config.diskSizeGb : 8;
        const blockDeviceMappings = [
            {
                DeviceName: '/dev/xvda',
                Ebs: {
                    VolumeType: diskType as never,
                    VolumeSize: diskSizeGb,
                    DeleteOnTermination: config.diskDeleteOnTermination !== false,
                    ...(diskType === 'io1' && config.diskIops ? { Iops: Number(config.diskIops) } : {}),
                    ...(diskType === 'gp3' && config.diskIops ? { Iops: Number(config.diskIops) } : {}),
                    ...(diskType === 'gp3' && config.diskThroughput ? { Throughput: Number(config.diskThroughput) } : {}),
                },
            },
        ];

        const result = await client.send(
            new RunInstancesCommand({
                ImageId: String(config.amiId ?? 'ami-0c55b159cbfafe1f0'),
                InstanceType: String(config.instanceType ?? 't3.micro') as never,
                MinCount: 1,
                MaxCount: 1,
                KeyName: config.keyName ? String(config.keyName) : undefined,
                SubnetId: config.subnetId ? String(config.subnetId) : undefined,
                SecurityGroupIds: Array.isArray(config.securityGroupIds) ? config.securityGroupIds.map(String) : undefined,
                BlockDeviceMappings: blockDeviceMappings,
                TagSpecifications: [
                    {
                        ResourceType: 'instance',
                        Tags: [
                            { Key: 'ManagedBy', Value: 'saas-multicloud' },
                            ...(config.tags && typeof config.tags === 'object'
                                ? Object.entries(config.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }))
                                : []),
                        ],
                    },
                ],
            }),
        ).catch((err: Error) => {
            this.logger.error(`EC2 RunInstances falhou: ${err.message}`);
            throw new InternalServerErrorException(`Falha ao provisionar EC2: ${err.message}`);
        });

        const instanceId = result.Instances?.[0]?.InstanceId;
        if (!instanceId) {
            throw new InternalServerErrorException('EC2 RunInstances não retornou instanceId');
        }

        this.logger.log(`EC2 provisionado: ${instanceId}`);
        return { awsResourceId: instanceId };
    }

    private async provisionS3(
        config: Record<string, unknown>,
        cloudAccountId: string,
        organizationId: string,
    ): Promise<ProvisionResult> {
        const client: S3Client = await this.connector.getS3Client(cloudAccountId, organizationId);
        const bucketName = String(config.bucketName);
        const region = String(config.region ?? 'us-east-1');

        await client.send(
            new CreateBucketCommand({
                Bucket: bucketName,
                ...(region !== 'us-east-1'
                    ? { CreateBucketConfiguration: { LocationConstraint: region as never } }
                    : {}),
            }),
        ).catch((err: Error) => {
            this.logger.error(`S3 CreateBucket falhou: ${err.message}`);
            throw new InternalServerErrorException(`Falha ao criar bucket S3: ${err.message}`);
        });

        if (config.versioning) {
            await client.send(
                new PutBucketVersioningCommand({
                    Bucket: bucketName,
                    VersioningConfiguration: { Status: 'Enabled' },
                }),
            ).catch((err: Error) => this.logger.warn(`S3 versioning falhou: ${err.message}`));
        }

        if (config.encryption !== false) {
            await client.send(
                new PutBucketEncryptionCommand({
                    Bucket: bucketName,
                    ServerSideEncryptionConfiguration: {
                        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
                    },
                }),
            ).catch((err: Error) => this.logger.warn(`S3 encryption falhou: ${err.message}`));
        }

        this.logger.log(`S3 bucket criado: ${bucketName}`);
        return { awsResourceId: bucketName };
    }

    private async provisionRds(
        config: Record<string, unknown>,
        cloudAccountId: string,
        organizationId: string,
    ): Promise<ProvisionResult> {
        const client: RDSClient = await this.connector.getRdsClient(cloudAccountId, organizationId);

        const result = await client.send(
            new CreateDBInstanceCommand({
                DBInstanceIdentifier: String(config.dbInstanceIdentifier),
                DBInstanceClass: String(config.dbInstanceClass ?? 'db.t3.micro'),
                Engine: String(config.engine ?? 'postgres'),
                MasterUsername: String(config.masterUsername),
                MasterUserPassword: String(config.masterUserPassword),
                AllocatedStorage: typeof config.allocatedStorage === 'number' ? config.allocatedStorage : 20,
                MultiAZ: config.multiAz === true,
                PubliclyAccessible: false,
                StorageEncrypted: true,
                Tags: [{ Key: 'ManagedBy', Value: 'saas-multicloud' }],
            }),
        ).catch((err: Error) => {
            this.logger.error(`RDS CreateDBInstance falhou: ${err.message}`);
            throw new InternalServerErrorException(`Falha ao criar instância RDS: ${err.message}`);
        });

        const dbId = result.DBInstance?.DBInstanceIdentifier;
        if (!dbId) {
            throw new InternalServerErrorException('RDS CreateDBInstance não retornou identificador');
        }

        this.logger.log(`RDS provisionado: ${dbId}`);
        return { awsResourceId: dbId };
    }

    private async provisionLambda(
        config: Record<string, unknown>,
        cloudAccountId: string,
        organizationId: string,
    ): Promise<ProvisionResult> {
        const client: LambdaClient = await this.connector.getLambdaClient(cloudAccountId, organizationId);

        // Código mínimo para criar a função (placeholder zip se não fornecido)
        const zipBase64 = typeof config.zipBase64 === 'string' ? config.zipBase64 : this.minimalLambdaZipBase64();

        const result = await client.send(
            new CreateFunctionCommand({
                FunctionName: String(config.functionName),
                Runtime: String(config.runtime ?? 'nodejs20.x') as never,
                Handler: String(config.handler ?? 'index.handler'),
                Role: String(config.roleArn),
                MemorySize: typeof config.memorySize === 'number' ? config.memorySize : 128,
                Timeout: typeof config.timeout === 'number' ? config.timeout : 30,
                Description: config.description ? String(config.description) : 'Created by SaaS MultiCloud',
                PackageType: PackageType.Zip,
                Code: { ZipFile: Buffer.from(zipBase64, 'base64') },
                Tags: { ManagedBy: 'saas-multicloud' },
            }),
        ).catch((err: Error) => {
            this.logger.error(`Lambda CreateFunction falhou: ${err.message}`);
            throw new InternalServerErrorException(`Falha ao criar Lambda: ${err.message}`);
        });

        const arn = result.FunctionArn;
        if (!arn) {
            throw new InternalServerErrorException('Lambda CreateFunction não retornou ARN');
        }

        this.logger.log(`Lambda provisionado: ${arn}`);
        return { awsResourceId: arn };
    }

    // Zip mínimo com um handler Node.js válido para placeholder
    private minimalLambdaZipBase64(): string {
        // Pre-built minimal zip: exports.handler = async () => ({ statusCode: 200 })
        return 'UEsDBAoAAAAAAKJaJ1cAAAAAAAAAAAAAAAAIABAAaW5kZXguanNVWAwAqfY+ZSj2PmUAAGV4cG9ydHMuaGFuZGxlciA9IGFzeW5jICgpID0+ICh7IHN0YXR1c0NvZGU6IDIwMCB9KTsKUEsBAj8ACgAAAAAAolonVwAAAAAAAAAAAAAAAAgAEAAAAAAAAAAAAKSBAAAAAGluZGV4LmpzVVgMAKn2PmUo9j5lAABQSwUGAAAAAAEAAQBCAAAAPgAAAAAA';
    }
}
