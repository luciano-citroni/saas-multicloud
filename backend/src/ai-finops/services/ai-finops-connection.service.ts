import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Organization } from '../../db/entites/organization.entity';
import { AiFinopsConnection } from '../../db/entites/ai-finops-connection.entity';
import { AiFinopsCredential } from '../../db/entites/ai-finops-credential.entity';
import { AiFinopsProviderSync } from '../../db/entites/ai-finops-provider-sync.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import {
    decryptCredentialsJson,
    encryptCredentialsJson,
    maskSecret,
} from '../../common/crypto/credentials-cipher';
import { AI_FINOPS_JOB_NAME, AI_FINOPS_PENDING_STATES, AI_FINOPS_QUEUE } from '../constants';
import type { CreateConnectionDto, SyncConnectionDto, UpdateConnectionDto } from '../dto';
import { AiFinopsAdapterRegistry } from '../providers/adapter.registry';
import { AiFinopsAuditService } from './ai-finops-audit.service';
import { AiFinopsProviderCatalogService } from './ai-finops-provider-catalog.service';

@Injectable()
export class AiFinopsConnectionService {
    constructor(
        @InjectRepository(AiFinopsConnection)
        private readonly connectionRepository: Repository<AiFinopsConnection>,
        @InjectRepository(AiFinopsCredential)
        private readonly credentialRepository: Repository<AiFinopsCredential>,
        @InjectRepository(AiFinopsProviderSync)
        private readonly syncRepository: Repository<AiFinopsProviderSync>,
        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>,
        @InjectQueue(AI_FINOPS_QUEUE) private readonly syncQueue: Queue,
        private readonly catalog: AiFinopsProviderCatalogService,
        private readonly adapters: AiFinopsAdapterRegistry,
        private readonly audit: AiFinopsAuditService,
        private readonly configService: ConfigService,
    ) {}

    private encryptionKey(): string {
        return this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') ?? '';
    }

    private encrypt(credentials: Record<string, unknown>): string {
        try {
            return encryptCredentialsJson(credentials, this.encryptionKey());
        } catch (error) {
            const code = error instanceof Error ? error.message : '';
            if (code === 'CREDENTIALS_ENCRYPTION_KEY_MISSING' || code === 'CREDENTIALS_ENCRYPTION_KEY_INVALID') {
                throw new InternalServerErrorException('CREDENTIALS_ENCRYPTION_KEY inválida ou ausente');
            }
            throw error;
        }
    }

    async decryptConnectionCredentials(connectionId: string, tenantId: string): Promise<Record<string, unknown>> {
        const credential = await this.credentialRepository
            .createQueryBuilder('credential')
            .addSelect('credential.encryptedValue')
            .where('credential.connection_id = :connectionId', { connectionId })
            .andWhere('credential.tenant_id = :tenantId', { tenantId })
            .getOne();
        if (!credential?.encryptedValue) {
            throw new NotFoundException(ErrorMessages.AI_FINOPS.CREDENTIAL_NOT_FOUND);
        }
        try {
            return decryptCredentialsJson(credential.encryptedValue, this.encryptionKey());
        } catch {
            throw new BadRequestException(ErrorMessages.AI_FINOPS.CREDENTIAL_VALIDATION_FAILED);
        }
    }

    async assertOrganizationBelongsToTenant(tenantId: string, organizationId: string): Promise<Organization> {
        const org = await this.organizationRepository.findOne({ where: { id: organizationId, tenantId } });
        if (!org) {
            throw new NotFoundException(ErrorMessages.AI_FINOPS.ORGANIZATION_NOT_FOUND);
        }
        return org;
    }

    private maskFromCredentials(credentials: Record<string, unknown>): string | null {
        const apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey : null;
        return apiKey ? maskSecret(apiKey) : null;
    }

    private hasAdminAccessFromCredentials(
        credentials: Record<string, unknown>,
        providerSlug: string,
    ): boolean {
        if (typeof credentials.adminApiKey === 'string' && credentials.adminApiKey.trim()) {
            return true;
        }
        if (providerSlug === 'azure_ai_foundry') {
            return Boolean(
                typeof credentials.tenantId === 'string' &&
                    credentials.tenantId.trim() &&
                    typeof credentials.clientId === 'string' &&
                    credentials.clientId.trim() &&
                    typeof credentials.clientSecret === 'string' &&
                    credentials.clientSecret.trim() &&
                    typeof credentials.subscriptionId === 'string' &&
                    credentials.subscriptionId.trim(),
            );
        }
        if (providerSlug === 'aws_bedrock') {
            return typeof credentials.roleArn === 'string' && Boolean(credentials.roleArn.trim());
        }
        if (providerSlug === 'microsoft_copilot') {
            return Boolean(
                typeof credentials.tenantId === 'string' &&
                    credentials.tenantId.trim() &&
                    typeof credentials.clientId === 'string' &&
                    credentials.clientId.trim() &&
                    typeof credentials.clientSecret === 'string' &&
                    credentials.clientSecret.trim(),
            );
        }
        return false;
    }

    private buildCredentialMetadata(credentials: Record<string, unknown>, providerSlug: string) {
        return {
            alg: 'aes-256-gcm',
            hasAdminAccess: this.hasAdminAccessFromCredentials(credentials, providerSlug),
        };
    }

    private toPublic(
        connection: AiFinopsConnection,
        maskedHint?: string | null,
        hasAdminAccess = false,
    ) {
        return {
            id: connection.id,
            tenantId: connection.tenantId,
            organizationId: connection.organizationId,
            providerId: connection.providerId,
            providerSlug: connection.providerSlug,
            name: connection.name,
            providerAccountId: connection.providerAccountId,
            providerProjectId: connection.providerProjectId,
            region: connection.region,
            status: connection.status,
            statusMessage: connection.statusMessage,
            lastSyncAt: connection.lastSyncAt,
            lastSyncStatus: connection.lastSyncStatus,
            modelsCount: connection.modelsCount,
            maskedCredential: maskedHint ?? null,
            hasAdminAccess,
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
        };
    }

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string } = { tenantId };
        if (organizationId) {
            await this.assertOrganizationBelongsToTenant(tenantId, organizationId);
            where.organizationId = organizationId;
        }
        const rows = await this.connectionRepository.find({ where, order: { createdAt: 'DESC' } });
        const credentials = await this.credentialRepository
            .createQueryBuilder('credential')
            .addSelect('credential.encryptedValue')
            .where('credential.tenant_id = :tenantId', { tenantId })
            .getMany();
        const credentialByConnection = new Map(credentials.map((c) => [c.connectionId, c]));
        const key = this.encryptionKey();

        return Promise.all(
            rows.map(async (row) => {
                const credential = credentialByConnection.get(row.id);
                let hasAdminAccess = credential?.encryptionMetadata?.hasAdminAccess === true;
                if (
                    credential?.encryptedValue &&
                    credential.encryptionMetadata?.hasAdminAccess === undefined
                ) {
                    try {
                        const decrypted = decryptCredentialsJson(credential.encryptedValue, key);
                        hasAdminAccess = this.hasAdminAccessFromCredentials(decrypted, row.providerSlug);
                        await this.credentialRepository.update(credential.id, {
                            encryptionMetadata: {
                                ...(credential.encryptionMetadata ?? {}),
                                alg: 'aes-256-gcm',
                                hasAdminAccess,
                            },
                        });
                    } catch {
                        hasAdminAccess = false;
                    }
                }
                return this.toPublic(row, credential?.maskedHint ?? null, hasAdminAccess);
            }),
        );
    }

    async findOrFail(tenantId: string, connectionId: string): Promise<AiFinopsConnection> {
        const connection = await this.connectionRepository.findOne({ where: { id: connectionId, tenantId } });
        if (!connection) {
            throw new NotFoundException(ErrorMessages.AI_FINOPS.CONNECTION_NOT_FOUND);
        }
        return connection;
    }

    async create(tenantId: string, userId: string | null, dto: CreateConnectionDto) {
        await this.assertOrganizationBelongsToTenant(tenantId, dto.organizationId);
        const provider = await this.catalog.findBySlug(dto.providerSlug);
        if (!provider) {
            throw new BadRequestException(ErrorMessages.AI_FINOPS.PROVIDER_NOT_SUPPORTED);
        }
        const adapter = this.adapters.get(dto.providerSlug);
        if (!adapter?.capabilities.validateCredentials) {
            throw new BadRequestException(ErrorMessages.AI_FINOPS.PROVIDER_CAPABILITY_UNAVAILABLE);
        }

        const validation = await adapter.validateCredentials(dto.credentials);
        if (!validation.ok) {
            throw new BadRequestException(validation.message ?? ErrorMessages.AI_FINOPS.CREDENTIAL_VALIDATION_FAILED);
        }

        const connection = await this.connectionRepository.save(
            this.connectionRepository.create({
                tenantId,
                organizationId: dto.organizationId,
                providerId: provider.id,
                providerSlug: provider.slug,
                name: dto.name,
                providerAccountId: dto.providerAccountId ?? validation.accountId ?? null,
                providerProjectId: dto.providerProjectId ?? validation.projectId ?? null,
                region: dto.region ?? null,
                status: 'active',
                statusMessage: validation.message ?? null,
            }),
        );

        const hasAdminAccess = this.hasAdminAccessFromCredentials(dto.credentials, provider.slug);
        await this.credentialRepository.save(
            this.credentialRepository.create({
                tenantId,
                connectionId: connection.id,
                credentialType: 'api_key',
                encryptedValue: this.encrypt(dto.credentials),
                maskedHint: this.maskFromCredentials(dto.credentials),
                encryptionMetadata: this.buildCredentialMetadata(dto.credentials, provider.slug),
            }),
        );

        await this.audit.log({
            tenantId,
            userId,
            action: 'connection.created',
            entityType: 'ai_finops_connection',
            entityId: connection.id,
            metadata: { providerSlug: provider.slug, organizationId: dto.organizationId },
        });

        await this.enqueueSync(tenantId, connection.id, { syncType: 'initial' });
        return this.toPublic(connection, this.maskFromCredentials(dto.credentials), hasAdminAccess);
    }

    async update(tenantId: string, userId: string | null, connectionId: string, dto: UpdateConnectionDto) {
        const connection = await this.findOrFail(tenantId, connectionId);
        if (dto.name !== undefined) connection.name = dto.name;
        if (dto.providerAccountId !== undefined) connection.providerAccountId = dto.providerAccountId;
        if (dto.providerProjectId !== undefined) connection.providerProjectId = dto.providerProjectId;
        if (dto.region !== undefined) connection.region = dto.region;
        if (dto.status !== undefined) connection.status = dto.status;

        let maskedHint: string | null | undefined;
        if (dto.credentials) {
            const adapter = this.adapters.get(connection.providerSlug);
            if (!adapter?.capabilities.validateCredentials) {
                throw new BadRequestException(ErrorMessages.AI_FINOPS.PROVIDER_CAPABILITY_UNAVAILABLE);
            }
            const validation = await adapter.validateCredentials(dto.credentials);
            if (!validation.ok) {
                throw new BadRequestException(validation.message ?? ErrorMessages.AI_FINOPS.CREDENTIAL_VALIDATION_FAILED);
            }
            const existing = await this.credentialRepository.findOne({
                where: { tenantId, connectionId },
            });
            maskedHint = this.maskFromCredentials(dto.credentials);
            const encryptionMetadata = this.buildCredentialMetadata(dto.credentials, connection.providerSlug);
            if (existing) {
                await this.credentialRepository.update(existing.id, {
                    encryptedValue: this.encrypt(dto.credentials),
                    maskedHint,
                    encryptionMetadata,
                });
            } else {
                await this.credentialRepository.save(
                    this.credentialRepository.create({
                        tenantId,
                        connectionId,
                        credentialType: 'api_key',
                        encryptedValue: this.encrypt(dto.credentials),
                        maskedHint,
                        encryptionMetadata,
                    }),
                );
            }
            await this.audit.log({
                tenantId,
                userId,
                action: 'credential.updated',
                entityType: 'ai_finops_credential',
                entityId: connectionId,
            });
        }

        const saved = await this.connectionRepository.save(connection);
        await this.audit.log({
            tenantId,
            userId,
            action: 'connection.updated',
            entityType: 'ai_finops_connection',
            entityId: connectionId,
        });
        const credential = await this.credentialRepository.findOne({
            where: { tenantId, connectionId },
            select: ['maskedHint', 'encryptionMetadata'],
        });
        const hasAdminAccess =
            dto.credentials != null
                ? this.hasAdminAccessFromCredentials(dto.credentials, saved.providerSlug)
                : credential?.encryptionMetadata?.hasAdminAccess === true;
        return this.toPublic(saved, maskedHint ?? credential?.maskedHint ?? null, hasAdminAccess);
    }

    async remove(tenantId: string, userId: string | null, connectionId: string): Promise<void> {
        const connection = await this.findOrFail(tenantId, connectionId);
        await this.connectionRepository.remove(connection);
        await this.audit.log({
            tenantId,
            userId,
            action: 'connection.deleted',
            entityType: 'ai_finops_connection',
            entityId: connectionId,
        });
        await this.audit.log({
            tenantId,
            userId,
            action: 'credential.deleted',
            entityType: 'ai_finops_credential',
            entityId: connectionId,
        });
    }

    async test(tenantId: string, connectionId: string) {
        const connection = await this.findOrFail(tenantId, connectionId);
        const adapter = this.adapters.get(connection.providerSlug);
        if (!adapter?.capabilities.validateCredentials) {
            throw new BadRequestException(ErrorMessages.AI_FINOPS.PROVIDER_CAPABILITY_UNAVAILABLE);
        }
        const creds = await this.decryptConnectionCredentials(connectionId, tenantId);
        const validation = await adapter.validateCredentials(creds);
        connection.status = validation.ok ? 'active' : 'error';
        connection.statusMessage = validation.message ?? null;
        await this.connectionRepository.save(connection);
        return { ok: validation.ok, message: validation.message ?? null, status: connection.status };
    }

    async enqueueSync(tenantId: string, connectionId: string, dto: SyncConnectionDto) {
        await this.findOrFail(tenantId, connectionId);
        const existing = await this.syncRepository.findOne({
            where: [
                { tenantId, connectionId, status: 'pending' },
                { tenantId, connectionId, status: 'running' },
            ],
            order: { createdAt: 'DESC' },
        });
        if (existing) {
            throw new ConflictException(ErrorMessages.AI_FINOPS.SYNC_IN_PROGRESS);
        }

        const counts = await this.syncQueue.getJobCounts(...AI_FINOPS_PENDING_STATES);
        const pendingJobs = Object.values(counts).reduce((sum, n) => sum + n, 0);
        if (pendingJobs > 500) {
            throw new ConflictException(ErrorMessages.AI_FINOPS.SYNC_IN_PROGRESS);
        }

        const syncRun = await this.syncRepository.save(
            this.syncRepository.create({
                tenantId,
                connectionId,
                syncType: dto.syncType,
                status: 'pending',
                metadata: { startDate: dto.startDate ?? null, endDate: dto.endDate ?? null },
            }),
        );

        await this.syncQueue.add(
            AI_FINOPS_JOB_NAME,
            {
                tenantId,
                connectionId,
                syncRunId: syncRun.id,
                syncType: dto.syncType,
                startDate: dto.startDate,
                endDate: dto.endDate,
            },
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: 50,
                removeOnFail: 20,
            },
        );

        return syncRun;
    }

    async listSyncs(tenantId: string, connectionId: string) {
        await this.findOrFail(tenantId, connectionId);
        return this.syncRepository.find({
            where: { tenantId, connectionId },
            order: { createdAt: 'DESC' },
            take: 50,
        });
    }
}
