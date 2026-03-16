import { Injectable, BadRequestException, Logger } from '@nestjs/common';

import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

import { EC2Client } from '@aws-sdk/client-ec2';

import { ECSClient } from '@aws-sdk/client-ecs';

import { EKSClient } from '@aws-sdk/client-eks';

import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';

import { IAMClient } from '@aws-sdk/client-iam';

import { RDSClient } from '@aws-sdk/client-rds';

import { S3Client } from '@aws-sdk/client-s3';

import { CloudFrontClient } from '@aws-sdk/client-cloudfront';

import { Route53Client } from '@aws-sdk/client-route-53';

import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';

import { LambdaClient } from '@aws-sdk/client-lambda';

import { APIGatewayClient } from '@aws-sdk/client-api-gateway';

import { KMSClient } from '@aws-sdk/client-kms';

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { ECRClient } from '@aws-sdk/client-ecr';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { ElastiCacheClient } from '@aws-sdk/client-elasticache';

import { SQSClient } from '@aws-sdk/client-sqs';

import { SNSClient } from '@aws-sdk/client-sns';

import { WAFV2Client } from '@aws-sdk/client-wafv2';

import { GuardDutyClient } from '@aws-sdk/client-guardduty';

import type { AwsCredentialIdentity } from '@aws-sdk/types';

import { CloudService } from '../cloud/cloud.service';

export interface AwsRoleCredentials {
    roleArn: string;

    region: string;

    regions?: string[];

    externalId?: string;
}

/**


 * Conector genérico para autenticação na AWS via STS AssumeRole.


 *


 * Responsabilidades:


 *  - Recuperar e descriptografar credenciais da CloudAccount


 *  - Assumir a role via STS usando credenciais de um usuário IAM


 *  - Fornecer factory methods de clientes AWS (EC2, S3, RDS, etc.)


 *


 * IMPORTANTE: Para aplicações executadas FORA da AWS:


 *  - Configure as variáveis de ambiente com as credenciais do usuário IAM:


 *    AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE


 *    AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY


 *  - O usuário IAM deve ter a permissão sts:AssumeRole para a role de destino


 *  - A role de destino deve confiar no usuário IAM (trust relationship)


 *


 * Formato esperado nas credenciais da CloudAccount (provider: aws):


 * {


 *   "roleArn":    "arn:aws:iam::123456789012:role/SaasMulticloudRole",


 *   "region":     "us-east-1",


 *   "externalId": "valor-opcional" // recomendado para cross-account


 * }


 */

@Injectable()
export class AwsConnectorService {
    private readonly logger = new Logger(AwsConnectorService.name);

    constructor(private readonly cloudService: CloudService) {}

    /**


     * Lê e valida as credenciais AWS de uma CloudAccount.


     */

    async resolveRoleCredentials(cloudAccountId: string, organizationId: string): Promise<AwsRoleCredentials> {
        const raw = await this.cloudService.getDecryptedCredentials(cloudAccountId, organizationId);

        if (!raw.roleArn || typeof raw.roleArn !== 'string') {
            throw new BadRequestException('Credencial AWS inválida: campo "roleArn" ausente ou inválido.');
        }

        const regions = Array.isArray(raw.regions)
            ? raw.regions.filter((region: unknown): region is string => typeof region === 'string' && region.trim() !== '')
            : [];

        const primaryRegion = typeof raw.region === 'string' && raw.region.trim() !== '' ? raw.region.trim() : regions[0];

        if (!primaryRegion) {
            throw new BadRequestException('Credencial AWS inválida: informe "region" ou "regions".');
        }

        return {
            roleArn: raw.roleArn,

            region: primaryRegion,

            regions: regions.length > 0 ? regions : [primaryRegion],

            externalId: raw.externalId as string | undefined,
        };
    }

    /**


     * Assume a role AWS via STS e retorna as credenciais temporárias.


     *


     * Este método usa as credenciais do usuário IAM configuradas nas variáveis de ambiente


     * (AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY) para fazer o AssumeRole.


     *


     * O STSClient automaticamente busca credenciais nesta ordem:


     * 1. Variáveis de ambiente (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)


     * 2. Arquivo ~/.aws/credentials


     * 3. IAM role da instância (se rodando em EC2/ECS/Lambda)


     *


     * Requisitos:


     * - O usuário IAM deve ter permissão sts:AssumeRole


     * - A role de destino deve ter trust policy permitindo o usuário IAM


     *


     * Útil quando o módulo consumidor precisa instanciar seu próprio cliente.


     */

    async assumeRole(creds: AwsRoleCredentials): Promise<AwsCredentialIdentity> {
        // Validação das variáveis de ambiente (opcional mas recomendado)

        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new BadRequestException('Credenciais AWS não configuradas. Defina AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY nas variáveis de ambiente.');
        }

        // O STSClient usa automaticamente as credenciais do ambiente

        const sts = new STSClient({
            region: creds.region,

            // As credenciais do usuário IAM são automaticamente carregadas das variáveis de ambiente
        });

        const { Credentials } = await sts

            .send(
                new AssumeRoleCommand({
                    RoleArn: creds.roleArn,

                    RoleSessionName: 'saas-multicloud',

                    ...(creds.externalId ? { ExternalId: creds.externalId } : {}),
                })
            )

            .catch((error) => {
                const errorMessage = error instanceof Error ? error.message : 'erro desconhecido';

                this.logger.warn(`Falha ao assumir role AWS para ${creds.roleArn}: ${errorMessage}`);

                throw new BadRequestException(
                    `Falha ao assumir a role "${creds.roleArn}". ` +
                        `Verifique: (1) O ARN da role está correto, ` +
                        `(2) A trust policy da role permite o usuário IAM, ` +
                        `(3) O usuário IAM tem permissão sts:AssumeRole, ` +
                        `(4) O externalId está correto (se aplicável).`
                );
            });

        if (!Credentials?.AccessKeyId || !Credentials?.SecretAccessKey) {
            throw new BadRequestException('STS retornou credenciais incompletas.');
        }

        return {
            accessKeyId: Credentials.AccessKeyId,

            secretAccessKey: Credentials.SecretAccessKey,

            sessionToken: Credentials.SessionToken,
        };
    }

    /**


     * Retorna um EC2Client autenticado via AssumeRole.


     */

    async getEc2Client(cloudAccountId: string, organizationId: string): Promise<EC2Client> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new EC2Client({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um ECSClient autenticado via AssumeRole.


     */

    async getEcsClient(cloudAccountId: string, organizationId: string): Promise<ECSClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new ECSClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um EKSClient autenticado via AssumeRole.


     */

    async getEksClient(cloudAccountId: string, organizationId: string): Promise<EKSClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new EKSClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um ElasticLoadBalancingV2Client autenticado via AssumeRole.


     */

    async getElbV2Client(cloudAccountId: string, organizationId: string, region?: string): Promise<ElasticLoadBalancingV2Client> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        // Usa a região fornecida ou fallback para a região das credenciais

        const finalRegion = region && region.trim() !== '' ? region : creds.region;

        const temporaryCreds = await this.assumeRole({ ...creds, region: finalRegion });

        return new ElasticLoadBalancingV2Client({ region: finalRegion, credentials: temporaryCreds });
    }

    /**


     * Retorna um IAMClient autenticado via AssumeRole.


     * IAM é um serviço global — a região padrão us-east-1 é usada automaticamente.


     */

    async getIamClient(cloudAccountId: string, organizationId: string): Promise<IAMClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new IAMClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um RDSClient autenticado via AssumeRole.


     */

    async getRdsClient(cloudAccountId: string, organizationId: string): Promise<RDSClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new RDSClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um S3Client autenticado via AssumeRole.


     */

    async getS3Client(cloudAccountId: string, organizationId: string): Promise<S3Client> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new S3Client({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um CloudFrontClient autenticado via AssumeRole.


     * CloudFront é um serviço global — qualquer região pode ser usada.


     */

    async getCloudFrontClient(cloudAccountId: string, organizationId: string): Promise<CloudFrontClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new CloudFrontClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um Route53Client autenticado via AssumeRole.


     * Route53 é um serviço global.


     */

    async getRoute53Client(cloudAccountId: string, organizationId: string): Promise<Route53Client> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new Route53Client({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um CloudWatchClient autenticado via AssumeRole.


     */

    async getCloudWatchClient(cloudAccountId: string, organizationId: string): Promise<CloudWatchClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new CloudWatchClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um CloudTrailClient autenticado via AssumeRole.


     */

    async getCloudTrailClient(cloudAccountId: string, organizationId: string): Promise<CloudTrailClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new CloudTrailClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um LambdaClient autenticado via AssumeRole.


     */

    async getLambdaClient(cloudAccountId: string, organizationId: string): Promise<LambdaClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new LambdaClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um APIGatewayClient autenticado via AssumeRole.


     */

    async getApiGatewayClient(cloudAccountId: string, organizationId: string): Promise<APIGatewayClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new APIGatewayClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um KMSClient autenticado via AssumeRole.


     */

    async getKmsClient(cloudAccountId: string, organizationId: string): Promise<KMSClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new KMSClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um SecretsManagerClient autenticado via AssumeRole.


     */

    async getSecretsManagerClient(cloudAccountId: string, organizationId: string): Promise<SecretsManagerClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new SecretsManagerClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um ECRClient autenticado via AssumeRole.


     */

    async getEcrClient(cloudAccountId: string, organizationId: string): Promise<ECRClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new ECRClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um DynamoDBClient autenticado via AssumeRole.


     */

    async getDynamoDbClient(cloudAccountId: string, organizationId: string): Promise<DynamoDBClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new DynamoDBClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um ElastiCacheClient autenticado via AssumeRole.


     */

    async getElastiCacheClient(cloudAccountId: string, organizationId: string): Promise<ElastiCacheClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new ElastiCacheClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um SQSClient autenticado via AssumeRole.


     */

    async getSqsClient(cloudAccountId: string, organizationId: string): Promise<SQSClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new SQSClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um SNSClient autenticado via AssumeRole.


     */

    async getSnsClient(cloudAccountId: string, organizationId: string): Promise<SNSClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new SNSClient({ region: creds.region, credentials: temporaryCreds });
    }

    /**


     * Retorna um WAFV2Client autenticado via AssumeRole.


     * Para Web ACLs CLOUDFRONT, a região deve obrigatoriamente ser us-east-1.


     * Passe region='us-east-1' para esse caso.


     */

    async getWafV2Client(cloudAccountId: string, organizationId: string, region?: string): Promise<WAFV2Client> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const finalRegion = region ?? creds.region;

        const temporaryCreds = await this.assumeRole({ ...creds, region: finalRegion });

        return new WAFV2Client({ region: finalRegion, credentials: temporaryCreds });
    }

    /**


     * Retorna um GuardDutyClient autenticado via AssumeRole.


     */

    async getGuardDutyClient(cloudAccountId: string, organizationId: string): Promise<GuardDutyClient> {
        const creds = await this.resolveRoleCredentials(cloudAccountId, organizationId);

        const temporaryCreds = await this.assumeRole(creds);

        return new GuardDutyClient({ region: creds.region, credentials: temporaryCreds });
    }
}
