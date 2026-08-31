import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { ClientSecretCredential } from '@azure/identity';
import { GoogleAuth, Impersonated, type JWTInput } from 'google-auth-library';
import { CloudProvider } from '../db/entites/cloud-account.entity';
import { ErrorMessages } from '../common/messages/error-messages';

const CONNECTION_TIMEOUT_MS = 20_000;

@Injectable()
export class CloudConnectionService {
    private readonly logger = new Logger(CloudConnectionService.name);

    constructor(private readonly configService: ConfigService) {}

    async verify(provider: CloudProvider, credentials: Record<string, unknown>): Promise<void> {
        await this.withTimeout(this.verifyProvider(provider, credentials));
    }

    private async verifyProvider(provider: CloudProvider, credentials: Record<string, unknown>): Promise<void> {
        if (provider === CloudProvider.AWS) {
            await this.verifyAws(credentials);
            return;
        }

        if (provider === CloudProvider.AZURE) {
            await this.verifyAzure(credentials);
            return;
        }

        if (provider === CloudProvider.GCP) {
            await this.verifyGcp(credentials);
        }
    }

    private async verifyAws(credentials: Record<string, unknown>): Promise<void> {
        const roleArn = typeof credentials.roleArn === 'string' ? credentials.roleArn : '';
        const region = typeof credentials.region === 'string' ? credentials.region : 'us-east-1';
        const externalId = typeof credentials.externalId === 'string' ? credentials.externalId : undefined;

        const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? process.env.AWS_SECRET_ACCESS_KEY;
        const sessionToken = this.configService.get<string>('AWS_SESSION_TOKEN') ?? process.env.AWS_SESSION_TOKEN;
        const stsRegion = this.configService.get<string>('AWS_STS_REGION')?.trim() || process.env.AWS_STS_REGION?.trim() || 'us-east-1';

        if (!accessKeyId || !secretAccessKey) {
            this.logger.error('AWS platform credentials are not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).');
            throw new InternalServerErrorException(ErrorMessages.CLOUD_ACCOUNTS.CONNECTION_UNAVAILABLE);
        }

        const sts = new STSClient({
            region: stsRegion,
            credentials: sessionToken
                ? { accessKeyId, secretAccessKey, sessionToken }
                : { accessKeyId, secretAccessKey },
        });

        try {
            const { Credentials } = await sts.send(
                new AssumeRoleCommand({
                    RoleArn: roleArn,
                    RoleSessionName: 'saas-multicloud-verify',
                    ...(externalId ? { ExternalId: externalId } : {}),
                })
            );

            if (!Credentials?.AccessKeyId || !Credentials?.SecretAccessKey) {
                throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.AWS_CONNECTION_FAILED);
            }

            this.logger.log(`AWS connection verified for role ${roleArn} in ${region}`);
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }

            const detail = error instanceof Error ? error.message : String(error);
            const awsErrorName = this.getAwsErrorName(error);
            this.logger.warn(`AWS AssumeRole failed for ${roleArn} [${awsErrorName}]: ${detail}`);

            if (this.isPlatformCredentialsError(error, detail)) {
                throw new InternalServerErrorException(ErrorMessages.CLOUD_ACCOUNTS.AWS_PLATFORM_CREDENTIALS_INVALID);
            }

            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.AWS_CONNECTION_FAILED);
        } finally {
            sts.destroy();
        }
    }

    private getAwsErrorName(error: unknown): string {
        if (error && typeof error === 'object' && 'name' in error && typeof error.name === 'string') {
            return error.name;
        }

        return 'UnknownError';
    }

    private isPlatformCredentialsError(error: unknown, detail: string): boolean {
        const awsErrorName = this.getAwsErrorName(error);
        const platformCredentialErrors = new Set(['InvalidClientTokenId', 'SignatureDoesNotMatch', 'ExpiredToken', 'UnrecognizedClientException']);

        if (platformCredentialErrors.has(awsErrorName)) {
            return true;
        }

        const normalizedDetail = detail.toLowerCase();
        return (
            normalizedDetail.includes('security token included in the request is invalid') ||
            normalizedDetail.includes('the request signature we calculated does not match') ||
            normalizedDetail.includes('expired token')
        );
    }

    private async verifyAzure(credentials: Record<string, unknown>): Promise<void> {
        const tenantId = typeof credentials.tenantId === 'string' ? credentials.tenantId : '';
        const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : '';
        const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '';
        const subscriptionId = this.resolveAzureSubscriptionId(credentials);

        const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

        try {
            const token = await credential.getToken('https://management.azure.com/.default');

            if (!token?.token) {
                throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.AZURE_CONNECTION_FAILED);
            }

            if (subscriptionId) {
                const response = await fetch(`https://management.azure.com/subscriptions/${subscriptionId}?api-version=2022-12-01`, {
                    headers: { Authorization: `Bearer ${token.token}` },
                });

                if (!response.ok) {
                    this.logger.warn(`Azure subscription check failed (${response.status}) for ${subscriptionId}`);
                    throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.AZURE_CONNECTION_FAILED);
                }
            }

            this.logger.log(`Azure connection verified for tenant ${tenantId}`);
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }

            const detail = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Azure authentication failed for tenant ${tenantId}: ${detail}`);
            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.AZURE_CONNECTION_FAILED);
        }
    }

    private async verifyGcp(credentials: Record<string, unknown>): Promise<void> {
        const projectId = typeof credentials.projectId === 'string' ? credentials.projectId : '';
        const serviceAccountEmail = typeof credentials.serviceAccountEmail === 'string' ? credentials.serviceAccountEmail : '';
        const impersonated = await this.buildGcpImpersonatedAuth(serviceAccountEmail);

        try {
            const tokenResponse = await impersonated.getAccessToken();

            if (!tokenResponse?.token) {
                throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.GCP_CONNECTION_FAILED);
            }

            this.logger.log(`GCP connection verified for project ${projectId} (${serviceAccountEmail})`);
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }

            const detail = error instanceof Error ? error.message : String(error);
            this.logger.warn(`GCP impersonation failed for ${serviceAccountEmail}: ${detail}`);
            throw new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.GCP_CONNECTION_FAILED);
        }
    }

    private async buildGcpImpersonatedAuth(serviceAccountEmail: string): Promise<Impersonated> {
        const credentialsJson = this.configService.get<string>('GCP_SA_CREDENTIALS_JSON');

        if (!credentialsJson) {
            this.logger.error('GCP_SA_CREDENTIALS_JSON is not configured.');
            throw new InternalServerErrorException(ErrorMessages.CLOUD_ACCOUNTS.CONNECTION_UNAVAILABLE);
        }

        let platformCredentials: JWTInput;

        try {
            const decoded = Buffer.from(credentialsJson, 'base64').toString('utf8');
            platformCredentials = JSON.parse(decoded) as JWTInput;
        } catch {
            try {
                platformCredentials = JSON.parse(credentialsJson) as JWTInput;
            } catch {
                this.logger.error('GCP_SA_CREDENTIALS_JSON is not valid JSON or base64 JSON.');
                throw new InternalServerErrorException(ErrorMessages.CLOUD_ACCOUNTS.CONNECTION_UNAVAILABLE);
            }
        }

        const platformAuth = new GoogleAuth({
            credentials: platformCredentials,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });

        const sourceClient = await platformAuth.getClient().catch((error: Error) => {
            this.logger.error(`Failed to authenticate the platform GCP service account: ${error.message}`);
            throw new InternalServerErrorException(ErrorMessages.CLOUD_ACCOUNTS.CONNECTION_UNAVAILABLE);
        });

        return new Impersonated({
            sourceClient,
            targetPrincipal: serviceAccountEmail,
            lifetime: 3600,
            delegates: [],
            targetScopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
    }

    private resolveAzureSubscriptionId(credentials: Record<string, unknown>): string | undefined {
        if (typeof credentials.subscriptionId === 'string' && credentials.subscriptionId.trim()) {
            return credentials.subscriptionId.trim();
        }

        if (Array.isArray(credentials.subscriptionIds)) {
            const first = credentials.subscriptionIds.find((id): id is string => typeof id === 'string' && id.trim().length > 0);
            return first?.trim();
        }

        return undefined;
    }

    private async withTimeout<T>(operation: Promise<T>, timeoutMs = CONNECTION_TIMEOUT_MS): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;

        try {
            return await Promise.race([
                operation,
                new Promise<T>((_, reject) => {
                    timer = setTimeout(() => {
                        timedOut = true;
                        reject(new BadRequestException(ErrorMessages.CLOUD_ACCOUNTS.CONNECTION_TIMEOUT));
                    }, timeoutMs);
                }),
            ]);
        } catch (error) {
            if (timedOut) {
                void operation.catch((lateError) => {
                    this.logger.warn(
                        `Connection verify settled after timeout: ${lateError instanceof Error ? lateError.message : String(lateError)}`
                    );
                });
            }

            throw error;
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }
}
