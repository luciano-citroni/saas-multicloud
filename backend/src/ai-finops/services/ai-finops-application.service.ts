import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsApplication } from '../../db/entites/ai-finops-application.entity';
import { AiFinopsApiKey } from '../../db/entites/ai-finops-api-key.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { CreateApiKeyDto, CreateApplicationDto } from '../dto';
import { AiFinopsAuditService } from './ai-finops-audit.service';
import { AiFinopsConnectionService } from './ai-finops-connection.service';

@Injectable()
export class AiFinopsApplicationService {
    constructor(
        @InjectRepository(AiFinopsApplication)
        private readonly applicationRepository: Repository<AiFinopsApplication>,
        @InjectRepository(AiFinopsApiKey)
        private readonly apiKeyRepository: Repository<AiFinopsApiKey>,
        private readonly connections: AiFinopsConnectionService,
        private readonly audit: AiFinopsAuditService,
    ) {}

    private hashKey(raw: string): string {
        return createHash('sha256').update(raw).digest('hex');
    }

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string } = { tenantId };
        if (organizationId) {
            await this.connections.assertOrganizationBelongsToTenant(tenantId, organizationId);
            where.organizationId = organizationId;
        }
        return this.applicationRepository.find({ where, order: { name: 'ASC' } });
    }

    async findOrFail(tenantId: string, applicationId: string) {
        const app = await this.applicationRepository.findOne({ where: { id: applicationId, tenantId } });
        if (!app) throw new NotFoundException(ErrorMessages.AI_FINOPS.APPLICATION_NOT_FOUND);
        return app;
    }

    async create(tenantId: string, userId: string | null, dto: CreateApplicationDto) {
        await this.connections.assertOrganizationBelongsToTenant(tenantId, dto.organizationId);
        const app = await this.applicationRepository.save(
            this.applicationRepository.create({
                tenantId,
                organizationId: dto.organizationId,
                name: dto.name,
                description: dto.description ?? null,
                status: 'active',
            }),
        );
        await this.audit.log({
            tenantId,
            userId,
            action: 'application.created',
            entityType: 'ai_finops_application',
            entityId: app.id,
        });
        return app;
    }

    async remove(tenantId: string, userId: string | null, applicationId: string) {
        const app = await this.findOrFail(tenantId, applicationId);
        await this.applicationRepository.remove(app);
        await this.audit.log({
            tenantId,
            userId,
            action: 'application.deleted',
            entityType: 'ai_finops_application',
            entityId: applicationId,
        });
    }

    async listKeys(tenantId: string, applicationId: string) {
        await this.findOrFail(tenantId, applicationId);
        const keys = await this.apiKeyRepository.find({
            where: { tenantId, applicationId },
            order: { createdAt: 'DESC' },
        });
        return keys.map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            allowedProviders: key.allowedProviders,
            allowedModels: key.allowedModels,
            expiresAt: key.expiresAt,
            lastUsedAt: key.lastUsedAt,
            revokedAt: key.revokedAt,
            createdAt: key.createdAt,
            userId: key.userId,
        }));
    }

    async createKey(tenantId: string, actorUserId: string | null, applicationId: string, dto: CreateApiKeyDto) {
        await this.findOrFail(tenantId, applicationId);
        const raw = `smc_ai_${randomBytes(24).toString('hex')}`;
        const key = await this.apiKeyRepository.save(
            this.apiKeyRepository.create({
                tenantId,
                applicationId,
                userId: dto.userId ?? null,
                name: dto.name,
                keyHash: this.hashKey(raw),
                keyPrefix: raw.slice(0, 12),
                permissions: {},
                allowedProviders: dto.allowedProviders,
                allowedModels: dto.allowedModels,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            }),
        );
        await this.audit.log({
            tenantId,
            userId: actorUserId,
            action: 'api_key.created',
            entityType: 'ai_finops_api_key',
            entityId: key.id,
            metadata: { applicationId },
        });
        return {
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            // Returned only once.
            apiKey: raw,
            createdAt: key.createdAt,
        };
    }

    async revokeKey(tenantId: string, actorUserId: string | null, applicationId: string, keyId: string) {
        await this.findOrFail(tenantId, applicationId);
        const key = await this.apiKeyRepository.findOne({ where: { id: keyId, tenantId, applicationId } });
        if (!key) throw new NotFoundException(ErrorMessages.AI_FINOPS.API_KEY_NOT_FOUND);
        key.revokedAt = new Date();
        await this.apiKeyRepository.save(key);
        await this.audit.log({
            tenantId,
            userId: actorUserId,
            action: 'api_key.revoked',
            entityType: 'ai_finops_api_key',
            entityId: keyId,
        });
        return { id: key.id, revokedAt: key.revokedAt };
    }

    async resolveApiKey(rawKey: string) {
        const keyHash = this.hashKey(rawKey);
        const key = await this.apiKeyRepository
            .createQueryBuilder('apiKey')
            .addSelect('apiKey.keyHash')
            .leftJoinAndSelect('apiKey.application', 'application')
            .where('apiKey.key_hash = :keyHash', { keyHash })
            .andWhere('apiKey.revoked_at IS NULL')
            .getOne();
        if (!key) throw new UnauthorizedException(ErrorMessages.AI_FINOPS.API_KEY_INVALID);
        if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
            throw new UnauthorizedException(ErrorMessages.AI_FINOPS.API_KEY_EXPIRED);
        }
        key.lastUsedAt = new Date();
        await this.apiKeyRepository.save(key);
        return key;
    }
}
