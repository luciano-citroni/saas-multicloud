import { Injectable, BadRequestException } from '@nestjs/common';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { EC2Client } from '@aws-sdk/client-ec2';
import { ECSClient } from '@aws-sdk/client-ecs';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { IAMClient } from '@aws-sdk/client-iam';
import { RDSClient } from '@aws-sdk/client-rds';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { CloudService } from '../cloud/cloud.service';

export interface AwsRoleCredentials {
    roleArn: string;
    region: string;
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
    constructor(private readonly cloudService: CloudService) {}

    /**
     * Lê e valida as credenciais AWS de uma CloudAccount.
     */
    async resolveRoleCredentials(cloudAccountId: string, organizationId: string): Promise<AwsRoleCredentials> {
        const raw = await this.cloudService.getDecryptedCredentials(cloudAccountId, organizationId);

        if (!raw.roleArn || typeof raw.roleArn !== 'string') {
            throw new BadRequestException('Credencial AWS inválida: campo "roleArn" ausente ou inválido.');
        }
        if (!raw.region || typeof raw.region !== 'string') {
            throw new BadRequestException('Credencial AWS inválida: campo "region" ausente ou inválido.');
        }

        return {
            roleArn: raw.roleArn,
            region: raw.region,
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
                console.log('Erro ao assumir role AWS:', error);
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

    // ---------------------------------------------------------------------------
    // Adicione aqui outros factory methods conforme novos módulos forem criados:
    //
    // async getS3Client(cloudAccountId: string, organizationId: string): Promise<S3Client>
    // async getRdsClient(cloudAccountId: string, organizationId: string): Promise<RDSClient>
    // async getLambdaClient(cloudAccountId: string, organizationId: string): Promise<LambdaClient>
    // ---------------------------------------------------------------------------
}
