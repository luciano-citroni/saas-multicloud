import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsLicense } from '../../db/entites/ai-finops-license.entity';
import { AiFinopsConnection } from '../../db/entites/ai-finops-connection.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { CreateLicenseDto, UpdateLicenseDto } from '../dto';
import { AiFinopsAuditService } from './ai-finops-audit.service';
import { AiFinopsConnectionService } from './ai-finops-connection.service';
import { MicrosoftCopilotFinopsAdapter } from '../providers/microsoft-copilot.adapter';

@Injectable()
export class AiFinopsLicenseService {
    constructor(
        @InjectRepository(AiFinopsLicense)
        private readonly licenseRepository: Repository<AiFinopsLicense>,
        @InjectRepository(AiFinopsConnection)
        private readonly connectionRepository: Repository<AiFinopsConnection>,
        private readonly connections: AiFinopsConnectionService,
        private readonly audit: AiFinopsAuditService,
        private readonly copilotAdapter: MicrosoftCopilotFinopsAdapter,
    ) {}

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string } = { tenantId };
        if (organizationId) {
            await this.connections.assertOrganizationBelongsToTenant(tenantId, organizationId);
            where.organizationId = organizationId;
        }
        return this.licenseRepository.find({ where, order: { createdAt: 'DESC' } });
    }

    async findOrFail(tenantId: string, licenseId: string) {
        const license = await this.licenseRepository.findOne({ where: { id: licenseId, tenantId } });
        if (!license) throw new NotFoundException(ErrorMessages.AI_FINOPS.LICENSE_NOT_FOUND);
        return license;
    }

    async create(tenantId: string, userId: string | null, dto: CreateLicenseDto) {
        await this.connections.assertOrganizationBelongsToTenant(tenantId, dto.organizationId);
        const license = await this.licenseRepository.save(
            this.licenseRepository.create({
                tenantId,
                organizationId: dto.organizationId,
                provider: dto.provider,
                licenseType: dto.licenseType,
                name: dto.name,
                quantity: String(dto.quantity),
                unitCost: String(dto.unitCost),
                currency: dto.currency,
                startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
                endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
                source: dto.source,
                remainingQuantity:
                    dto.remainingQuantity != null ? String(dto.remainingQuantity) : String(dto.quantity),
                metadata: dto.metadata ?? {},
                status: 'active',
            }),
        );
        await this.audit.log({
            tenantId,
            userId,
            action: 'license.created',
            entityType: 'ai_finops_license',
            entityId: license.id,
        });
        return license;
    }

    async update(tenantId: string, userId: string | null, licenseId: string, dto: UpdateLicenseDto) {
        const license = await this.findOrFail(tenantId, licenseId);
        if (dto.provider !== undefined) license.provider = dto.provider;
        if (dto.licenseType !== undefined) license.licenseType = dto.licenseType;
        if (dto.name !== undefined) license.name = dto.name;
        if (dto.quantity !== undefined) license.quantity = String(dto.quantity);
        if (dto.unitCost !== undefined) license.unitCost = String(dto.unitCost);
        if (dto.currency !== undefined) license.currency = dto.currency;
        if (dto.startsAt !== undefined) license.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
        if (dto.endsAt !== undefined) license.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
        if (dto.source !== undefined) license.source = dto.source;
        if (dto.remainingQuantity !== undefined) {
            license.remainingQuantity =
                dto.remainingQuantity != null ? String(dto.remainingQuantity) : null;
        }
        if (dto.metadata !== undefined) license.metadata = dto.metadata;
        if (dto.status !== undefined) license.status = dto.status;
        const saved = await this.licenseRepository.save(license);
        await this.audit.log({
            tenantId,
            userId,
            action: 'license.updated',
            entityType: 'ai_finops_license',
            entityId: licenseId,
        });
        return saved;
    }

    async remove(tenantId: string, userId: string | null, licenseId: string) {
        const license = await this.findOrFail(tenantId, licenseId);
        await this.licenseRepository.remove(license);
        await this.audit.log({
            tenantId,
            userId,
            action: 'license.deleted',
            entityType: 'ai_finops_license',
            entityId: licenseId,
        });
    }

    /**
     * Upsert Azure AI Foundry / Azure OpenAI credit packs from a connection sync payload.
     * Does not invent numbers — only persists values explicitly provided by the caller/adapter.
     */
    async upsertAzureCredits(
        tenantId: string,
        organizationId: string,
        entries: Array<{
            name: string;
            quantity: number;
            remainingQuantity?: number;
            unitCost?: number;
            currency?: string;
            startsAt?: string | null;
            endsAt?: string | null;
            metadata?: Record<string, unknown>;
        }>,
        userId: string | null = null,
    ) {
        await this.connections.assertOrganizationBelongsToTenant(tenantId, organizationId);
        const saved: AiFinopsLicense[] = [];
        for (const entry of entries) {
            const existing = await this.licenseRepository.findOne({
                where: {
                    tenantId,
                    organizationId,
                    provider: 'azure_ai_foundry',
                    licenseType: 'credit_pack',
                    name: entry.name,
                    source: 'azure_billing',
                },
            });
            if (existing) {
                existing.quantity = String(entry.quantity);
                existing.remainingQuantity =
                    entry.remainingQuantity != null
                        ? String(entry.remainingQuantity)
                        : existing.remainingQuantity;
                if (entry.unitCost != null) existing.unitCost = String(entry.unitCost);
                if (entry.currency) existing.currency = entry.currency;
                if (entry.startsAt !== undefined) {
                    existing.startsAt = entry.startsAt ? new Date(entry.startsAt) : null;
                }
                if (entry.endsAt !== undefined) {
                    existing.endsAt = entry.endsAt ? new Date(entry.endsAt) : null;
                }
                if (entry.metadata) existing.metadata = { ...existing.metadata, ...entry.metadata };
                saved.push(await this.licenseRepository.save(existing));
            } else {
                saved.push(
                    await this.create(tenantId, userId, {
                        organizationId,
                        provider: 'azure_ai_foundry',
                        licenseType: 'credit_pack',
                        name: entry.name,
                        quantity: entry.quantity,
                        unitCost: entry.unitCost ?? 0,
                        currency: entry.currency ?? 'USD',
                        startsAt: entry.startsAt ?? null,
                        endsAt: entry.endsAt ?? null,
                        source: 'azure_billing',
                        remainingQuantity: entry.remainingQuantity ?? entry.quantity,
                        metadata: entry.metadata ?? {},
                    }),
                );
            }
        }
        return saved;
    }

    /** Sync Copilot seats from Graph subscribedSkus into license rows (seat type). */
    async syncCopilotSeats(tenantId: string, connectionId: string, userId: string | null = null) {
        const connection = await this.connectionRepository.findOne({
            where: { id: connectionId, tenantId, providerSlug: 'microsoft_copilot' },
        });
        if (!connection) throw new NotFoundException(ErrorMessages.AI_FINOPS.CONNECTION_NOT_FOUND);
        const creds = await this.connections.decryptConnectionCredentials(connection.id, tenantId);
        const seats = await this.copilotAdapter.listCopilotSeats(creds);
        if (!seats.length) {
            return {
                synced: 0,
                message:
                    'No Copilot SKUs returned by Microsoft Graph. Capability unavailable or empty inventory.',
            };
        }
        let synced = 0;
        for (const seat of seats) {
            const name = seat.skuPartNumber;
            const existing = await this.licenseRepository.findOne({
                where: {
                    tenantId,
                    organizationId: connection.organizationId,
                    provider: 'microsoft_copilot',
                    licenseType: 'seat',
                    name,
                    source: 'microsoft_graph',
                },
            });
            const payload = {
                organizationId: connection.organizationId,
                provider: 'microsoft_copilot',
                licenseType: 'seat' as const,
                name,
                quantity: seat.prepaidUnits,
                unitCost: 0,
                currency: 'USD',
                startsAt: null,
                endsAt: null,
                source: 'microsoft_graph',
                remainingQuantity: Math.max(0, seat.prepaidUnits - seat.consumedUnits),
                metadata: {
                    skuId: seat.skuId,
                    consumedUnits: seat.consumedUnits,
                    connectionId: connection.id,
                },
            };
            if (existing) {
                await this.update(tenantId, userId, existing.id, payload);
            } else {
                await this.create(tenantId, userId, payload);
            }
            synced += 1;
        }
        return { synced, message: `Synced ${synced} Copilot seat license row(s).` };
    }

    async summary(tenantId: string, organizationId?: string) {
        const licenses = await this.list(tenantId, organizationId);
        const seats = licenses.filter((l) => l.licenseType === 'seat' && l.status === 'active');
        const credits = licenses.filter(
            (l) =>
                (l.licenseType === 'credit_pack' || l.licenseType === 'commitment') &&
                l.status === 'active',
        );
        const seatQuantity = seats.reduce((sum, l) => sum + Number(l.quantity), 0);
        const seatCost = seats.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitCost), 0);
        const creditRemaining = credits.reduce(
            (sum, l) => sum + Number(l.remainingQuantity ?? l.quantity),
            0,
        );
        const creditTotal = credits.reduce((sum, l) => sum + Number(l.quantity), 0);
        return {
            seats: { count: seats.length, quantity: seatQuantity, monthlyCost: seatCost },
            credits: { count: credits.length, remaining: creditRemaining, total: creditTotal },
            licenses,
        };
    }
}
