import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsPolicy } from '../../db/entites/ai-finops-policy.entity';
import { AiFinopsUsageDaily } from '../../db/entites/ai-finops-usage-daily.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { CreatePolicyDto, UpdatePolicyDto } from '../dto';
import { AiFinopsAuditService } from './ai-finops-audit.service';
import { AiFinopsConnectionService } from './ai-finops-connection.service';

@Injectable()
export class AiFinopsPolicyService {
    constructor(
        @InjectRepository(AiFinopsPolicy)
        private readonly policyRepository: Repository<AiFinopsPolicy>,
        @InjectRepository(AiFinopsUsageDaily)
        private readonly dailyRepository: Repository<AiFinopsUsageDaily>,
        private readonly connections: AiFinopsConnectionService,
        private readonly audit: AiFinopsAuditService,
    ) {}

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string } = { tenantId };
        if (organizationId) {
            await this.connections.assertOrganizationBelongsToTenant(tenantId, organizationId);
            where.organizationId = organizationId;
        }
        return this.policyRepository.find({ where, order: { createdAt: 'DESC' } });
    }

    async findOrFail(tenantId: string, policyId: string) {
        const policy = await this.policyRepository.findOne({ where: { id: policyId, tenantId } });
        if (!policy) throw new NotFoundException(ErrorMessages.AI_FINOPS.POLICY_NOT_FOUND);
        return policy;
    }

    async create(tenantId: string, userId: string | null, dto: CreatePolicyDto) {
        await this.connections.assertOrganizationBelongsToTenant(tenantId, dto.organizationId);
        const policy = await this.policyRepository.save(
            this.policyRepository.create({
                tenantId,
                organizationId: dto.organizationId,
                scopeType: dto.scopeType,
                scopeId: dto.scopeId ?? null,
                name: dto.name,
                maxTokens: dto.maxTokens != null ? String(dto.maxTokens) : null,
                maxCost: dto.maxCost != null ? String(dto.maxCost) : null,
                maxRequestsPerMinute: dto.maxRequestsPerMinute ?? null,
                allowedProviders: dto.allowedProviders,
                allowedModels: dto.allowedModels,
                onLimitAction: dto.onLimitAction,
                fallbackConfig: dto.fallbackConfig,
                status: 'active',
            }),
        );
        await this.audit.log({
            tenantId,
            userId,
            action: 'policy.created',
            entityType: 'ai_finops_policy',
            entityId: policy.id,
        });
        return policy;
    }

    async update(tenantId: string, userId: string | null, policyId: string, dto: UpdatePolicyDto) {
        const policy = await this.findOrFail(tenantId, policyId);
        if (dto.scopeType !== undefined) policy.scopeType = dto.scopeType;
        if (dto.scopeId !== undefined) policy.scopeId = dto.scopeId;
        if (dto.name !== undefined) policy.name = dto.name;
        if (dto.maxTokens !== undefined) policy.maxTokens = dto.maxTokens != null ? String(dto.maxTokens) : null;
        if (dto.maxCost !== undefined) policy.maxCost = dto.maxCost != null ? String(dto.maxCost) : null;
        if (dto.maxRequestsPerMinute !== undefined) policy.maxRequestsPerMinute = dto.maxRequestsPerMinute;
        if (dto.allowedProviders !== undefined) policy.allowedProviders = dto.allowedProviders;
        if (dto.allowedModels !== undefined) policy.allowedModels = dto.allowedModels;
        if (dto.onLimitAction !== undefined) policy.onLimitAction = dto.onLimitAction;
        if (dto.fallbackConfig !== undefined) policy.fallbackConfig = dto.fallbackConfig;
        const saved = await this.policyRepository.save(policy);
        await this.audit.log({
            tenantId,
            userId,
            action: 'policy.updated',
            entityType: 'ai_finops_policy',
            entityId: policyId,
        });
        return saved;
    }

    async remove(tenantId: string, userId: string | null, policyId: string) {
        const policy = await this.findOrFail(tenantId, policyId);
        await this.policyRepository.remove(policy);
        await this.audit.log({
            tenantId,
            userId,
            action: 'policy.deleted',
            entityType: 'ai_finops_policy',
            entityId: policyId,
        });
    }

    async evaluateGatewayRequest(input: {
        tenantId: string;
        organizationId: string;
        connectionId?: string | null;
        userId?: string | null;
        providerUserExternalId?: string | null;
        teamId?: string | null;
        applicationId?: string | null;
        provider: string;
        model: string;
        estimatedTokens: number;
        estimatedCost: number;
    }): Promise<{
        allowed: boolean;
        action: string;
        reason?: string;
        maxTokens?: number | null;
        maxCost?: number | null;
        maxRequestsPerMinute?: number | null;
    }> {
        const policies = await this.policyRepository.find({
            where: { tenantId: input.tenantId, organizationId: input.organizationId, status: 'active' },
        });

        const applicable = policies.filter((policy) => {
            if (policy.scopeType === 'organization') return true;
            if (policy.scopeType === 'connection') return policy.scopeId === input.connectionId;
            if (policy.scopeType === 'team') return policy.scopeId === input.teamId;
            if (policy.scopeType === 'user') {
                const matchesIdentity =
                    Boolean(policy.scopeId) &&
                    (policy.scopeId === input.userId ||
                        policy.scopeId === input.providerUserExternalId);
                if (!matchesIdentity) return false;
                const boundConnectionId =
                    typeof policy.fallbackConfig?.connectionId === 'string'
                        ? policy.fallbackConfig.connectionId
                        : null;
                if (boundConnectionId && boundConnectionId !== input.connectionId) return false;
                return true;
            }
            if (policy.scopeType === 'application') return policy.scopeId === input.applicationId;
            return false;
        });

        // Sort by hierarchy: user > connection > application > team > organization
        const rank = {
            user: 0,
            connection: 1,
            application: 2,
            team: 3,
            organization: 4,
        } as const;
        applicable.sort((a, b) => rank[a.scopeType] - rank[b.scopeType]);

        let maxTokens: number | null = null;
        let maxCost: number | null = null;
        let maxRequestsPerMinute: number | null = null;
        for (const policy of applicable) {
            if (policy.maxTokens != null) {
                const value = Number(policy.maxTokens);
                maxTokens = maxTokens == null ? value : Math.min(maxTokens, value);
            }
            if (policy.maxCost != null) {
                const value = Number(policy.maxCost);
                maxCost = maxCost == null ? value : Math.min(maxCost, value);
            }
            if (policy.maxRequestsPerMinute != null) {
                maxRequestsPerMinute =
                    maxRequestsPerMinute == null
                        ? policy.maxRequestsPerMinute
                        : Math.min(maxRequestsPerMinute, policy.maxRequestsPerMinute);
            }
        }

        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const monthKey = monthStart.toISOString().slice(0, 10);

        for (const policy of applicable) {
            if (policy.allowedProviders.length && !policy.allowedProviders.includes(input.provider)) {
                if (policy.onLimitAction === 'block' || policy.onLimitAction === 'block_models') {
                    throw new ForbiddenException(ErrorMessages.AI_FINOPS.POLICY_BLOCKED);
                }
                return {
                    allowed: false,
                    action: policy.onLimitAction,
                    reason: 'provider_not_allowed',
                    maxTokens,
                    maxCost,
                    maxRequestsPerMinute,
                };
            }
            if (policy.allowedModels.length && !policy.allowedModels.includes(input.model)) {
                if (policy.onLimitAction === 'block' || policy.onLimitAction === 'block_models') {
                    throw new ForbiddenException(ErrorMessages.AI_FINOPS.POLICY_BLOCKED);
                }
                return {
                    allowed: false,
                    action: policy.onLimitAction,
                    reason: 'model_not_allowed',
                    maxTokens,
                    maxCost,
                    maxRequestsPerMinute,
                };
            }

            const spentQb = this.dailyRepository
                .createQueryBuilder('daily')
                .select('COALESCE(SUM(daily.estimated_cost::numeric), 0)', 'estimated')
                .addSelect('COALESCE(SUM(daily.total_tokens::numeric), 0)', 'tokens')
                .where('daily.tenant_id = :tenantId', { tenantId: input.tenantId })
                .andWhere('daily.organization_id = :organizationId', { organizationId: input.organizationId })
                .andWhere('daily.usage_source = :source', { source: 'gateway' })
                .andWhere('daily.usage_date >= :monthKey', { monthKey });

            if (policy.scopeType === 'connection' && input.connectionId) {
                spentQb.andWhere('daily.connection_id = :connectionId', {
                    connectionId: input.connectionId,
                });
            }
            if (policy.scopeType === 'user' && policy.scopeId) {
                spentQb.andWhere(
                    '(daily.user_id = :policyUserId OR daily.provider_user_external_id = :policyUserId)',
                    { policyUserId: policy.scopeId },
                );
                const boundConnectionId =
                    typeof policy.fallbackConfig?.connectionId === 'string'
                        ? policy.fallbackConfig.connectionId
                        : input.connectionId;
                if (boundConnectionId) {
                    spentQb.andWhere('daily.connection_id = :policyConnectionId', {
                        policyConnectionId: boundConnectionId,
                    });
                }
            }
            if (policy.scopeType === 'team' && input.teamId) {
                spentQb.andWhere('daily.team_id = :teamId', { teamId: input.teamId });
            }
            if (policy.scopeType === 'application' && input.applicationId) {
                spentQb.andWhere('daily.application_id = :applicationId', { applicationId: input.applicationId });
            }

            const spent = await spentQb.getRawOne<{ estimated: string; tokens: string }>();
            const tokensUsed = Number(spent?.tokens ?? 0) + input.estimatedTokens;
            const costUsed = Number(spent?.estimated ?? 0) + input.estimatedCost;

            if (policy.maxTokens != null && tokensUsed > Number(policy.maxTokens)) {
                if (policy.onLimitAction === 'block') {
                    throw new ForbiddenException(ErrorMessages.AI_FINOPS.POLICY_BLOCKED);
                }
                return {
                    allowed: false,
                    action: policy.onLimitAction,
                    reason: 'max_tokens',
                    maxTokens,
                    maxCost,
                    maxRequestsPerMinute,
                };
            }
            if (policy.maxCost != null && costUsed > Number(policy.maxCost)) {
                if (policy.onLimitAction === 'block') {
                    throw new ForbiddenException(ErrorMessages.AI_FINOPS.BUDGET_EXCEEDED);
                }
                return {
                    allowed: false,
                    action: policy.onLimitAction,
                    reason: 'max_cost',
                    maxTokens,
                    maxCost,
                    maxRequestsPerMinute,
                };
            }
        }

        return { allowed: true, action: 'allow', maxTokens, maxCost, maxRequestsPerMinute };
    }
}
