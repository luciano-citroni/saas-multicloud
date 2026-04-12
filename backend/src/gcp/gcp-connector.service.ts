import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { google } from 'googleapis';

import { CloudService } from '../cloud/cloud.service';

export interface GcpCredentials {
    projectId: string;
    serviceAccountEmail: string;
}

/**
 * Conector GCP via Service Account Impersonation.
 *
 * Responsabilidades:
 *  - Descriptografar credenciais { projectId, serviceAccountEmail } da CloudAccount
 *  - Criar um cliente Impersonated usando a SA da plataforma (GCP_SA_CREDENTIALS_JSON)
 *  - Fornecer factory methods de clientes googleapis (Compute, Storage, SQL, GKE, IAM)
 *
 * Variável de ambiente obrigatória:
 *   GCP_SA_CREDENTIALS_JSON — JSON da service account da plataforma (base64 ou JSON string)
 */
@Injectable()
export class GcpConnectorService {
    private readonly logger = new Logger(GcpConnectorService.name);

    constructor(
        private readonly cloudService: CloudService,
        private readonly configService: ConfigService
    ) {}

    async resolveCredentials(cloudAccountId: string, organizationId: string): Promise<GcpCredentials> {
        const raw = await this.cloudService.getDecryptedCredentials(cloudAccountId, organizationId);

        if (!raw.projectId || typeof raw.projectId !== 'string') {
            throw new BadRequestException('Credencial GCP inválida: campo "projectId" ausente ou inválido.');
        }

        if (!raw.serviceAccountEmail || typeof raw.serviceAccountEmail !== 'string') {
            throw new BadRequestException('Credencial GCP inválida: campo "serviceAccountEmail" ausente ou inválido.');
        }

        return { projectId: raw.projectId, serviceAccountEmail: raw.serviceAccountEmail };
    }

    /**
     * Cria um cliente de autenticação impersonado para a SA do cliente.
     * A plataforma usa sua própria SA (GCP_SA_CREDENTIALS_JSON) para impersonar.
     */
    async getImpersonatedAuth(serviceAccountEmail: string): Promise<Impersonated> {
        const credentialsJson = this.configService.get<string>('GCP_SA_CREDENTIALS_JSON');

        if (!credentialsJson) {
            throw new BadRequestException(
                'GCP_SA_CREDENTIALS_JSON não configurada. ' + 'Defina a variável de ambiente com o JSON da service account da plataforma.'
            );
        }

        let credentials: Record<string, any>;
        try {
            const decoded = Buffer.from(credentialsJson, 'base64').toString('utf8');
            credentials = JSON.parse(decoded);
        } catch {
            try {
                credentials = JSON.parse(credentialsJson);
            } catch {
                throw new BadRequestException('GCP_SA_CREDENTIALS_JSON inválida: deve ser um JSON válido ou base64 de um JSON.');
            }
        }

        const platformAuth = new GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });

        const sourceClient = await platformAuth.getClient().catch((err: Error) => {
            this.logger.warn(`Falha ao criar cliente de autenticação GCP: ${err.message}`);
            throw new BadRequestException(`Falha ao autenticar com a service account da plataforma. Verifique GCP_SA_CREDENTIALS_JSON.`);
        });

        return new Impersonated({
            sourceClient: sourceClient as any,
            targetPrincipal: serviceAccountEmail,
            lifetime: 3600,
            delegates: [],
            targetScopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
    }

    async getComputeClient(cloudAccountId: string, organizationId: string) {
        const creds = await this.resolveCredentials(cloudAccountId, organizationId);
        const auth = await this.getImpersonatedAuth(creds.serviceAccountEmail);
        return { client: google.compute({ version: 'v1', auth: auth as any }), projectId: creds.projectId };
    }

    async getStorageClient(cloudAccountId: string, organizationId: string) {
        const creds = await this.resolveCredentials(cloudAccountId, organizationId);
        const auth = await this.getImpersonatedAuth(creds.serviceAccountEmail);
        return { client: google.storage({ version: 'v1', auth: auth as any }), projectId: creds.projectId };
    }

    async getSqlAdminClient(cloudAccountId: string, organizationId: string) {
        const creds = await this.resolveCredentials(cloudAccountId, organizationId);
        const auth = await this.getImpersonatedAuth(creds.serviceAccountEmail);
        return { client: google.sqladmin({ version: 'v1', auth: auth as any }), projectId: creds.projectId };
    }

    async getContainerClient(cloudAccountId: string, organizationId: string) {
        const creds = await this.resolveCredentials(cloudAccountId, organizationId);
        const auth = await this.getImpersonatedAuth(creds.serviceAccountEmail);
        return { client: google.container({ version: 'v1', auth: auth as any }), projectId: creds.projectId };
    }

    async getIamClient(cloudAccountId: string, organizationId: string) {
        const creds = await this.resolveCredentials(cloudAccountId, organizationId);
        const auth = await this.getImpersonatedAuth(creds.serviceAccountEmail);
        return { client: google.iam({ version: 'v1', auth: auth as any }), projectId: creds.projectId };
    }

    async getRunClient(cloudAccountId: string, organizationId: string) {
        const creds = await this.resolveCredentials(cloudAccountId, organizationId);
        const auth = await this.getImpersonatedAuth(creds.serviceAccountEmail);
        return { client: google.run({ version: 'v2', auth: auth as any }), projectId: creds.projectId };
    }
}
