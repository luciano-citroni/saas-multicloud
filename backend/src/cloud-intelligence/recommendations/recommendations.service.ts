import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorMessages } from '../../common/messages/error-messages';
import {
    AiRecommendation,
    type AiRecommendationPriority,
    type AiRecommendationSeverity,
    type AiRecommendationStatus,
} from '../../db/entites/ai-recommendation.entity';
import { AiAuditService } from '../audit/ai-audit.service';

const ACTIVE_STATUSES: AiRecommendationStatus[] = ['NEW', 'REVIEWING', 'APPROVED', 'EXECUTING'];

const ALLOWED_TRANSITIONS: Record<AiRecommendationStatus, AiRecommendationStatus[]> = {
    NEW: ['REVIEWING', 'APPROVED', 'REJECTED', 'DISMISSED'],
    REVIEWING: ['APPROVED', 'REJECTED', 'DISMISSED', 'NEW'],
    APPROVED: ['EXECUTING', 'REJECTED', 'DISMISSED'],
    REJECTED: ['NEW', 'DISMISSED'],
    EXECUTING: ['COMPLETED', 'FAILED', 'DISMISSED'],
    COMPLETED: ['DISMISSED'],
    FAILED: ['NEW', 'DISMISSED'],
    DISMISSED: ['NEW'],
};

@Injectable()
export class RecommendationsService {
    constructor(
        @InjectRepository(AiRecommendation)
        private readonly recommendationRepository: Repository<AiRecommendation>,
        private readonly auditService: AiAuditService,
    ) {}

    async list(
        organizationId: string,
        filters?: {
            status?: AiRecommendationStatus | AiRecommendationStatus[];
            category?: string;
            agentType?: string;
            assignee?: string;
            automatable?: boolean;
            minScore?: number;
            correlated?: boolean;
            take?: number;
        },
    ): Promise<AiRecommendation[]> {
        const qb = this.recommendationRepository
            .createQueryBuilder('r')
            .where('r.organization_id = :organizationId', { organizationId })
            .orderBy(`COALESCE((r.estimated_impact->>'rankingScore')::float, 0)`, 'DESC')
            .addOrderBy('r.created_at', 'DESC')
            .take(filters?.take ?? 100);

        if (filters?.status) {
            const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
            qb.andWhere('r.status IN (:...statuses)', { statuses });
        }
        if (filters?.category) {
            qb.andWhere('r.category = :category', { category: filters.category });
        }
        if (filters?.agentType) {
            qb.andWhere('r.agent_type = :agentType', { agentType: filters.agentType });
        }
        if (filters?.assignee) {
            qb.andWhere('r.assignee_user_id = :assignee', { assignee: filters.assignee });
        }
        if (filters?.minScore != null) {
            qb.andWhere(`COALESCE((r.estimated_impact->>'rankingScore')::float, 0) >= :minScore`, {
                minScore: filters.minScore,
            });
        }
        if (filters?.correlated === true) {
            qb.andWhere(`jsonb_array_length(COALESCE(r.evidence->'sources', '[]'::jsonb)) > 1`);
        } else if (filters?.correlated === false) {
            qb.andWhere(`jsonb_array_length(COALESCE(r.evidence->'sources', '[]'::jsonb)) <= 1`);
        }

        const rows = await qb.getMany();
        if (filters?.automatable == null) {
            return rows;
        }
        const { canAutomateRecommendation } = await import('./recommendation-capabilities');
        return rows.filter((row) => canAutomateRecommendation(row) === filters.automatable);
    }

    async findOrFail(id: string, organizationId: string): Promise<AiRecommendation> {
        const entity = await this.recommendationRepository.findOne({ where: { id, organizationId } });
        if (!entity) {
            throw new NotFoundException(ErrorMessages.CLOUD_INTELLIGENCE.RECOMMENDATION_NOT_FOUND);
        }
        return entity;
    }

    /**
     * Upsert by dedupe key for active statuses. Returns existing active row when duplicate.
     */
    async upsertRecommendation(input: {
        organizationId: string;
        userId?: string | null;
        agentType: string;
        category: string;
        title: string;
        description: string;
        severity?: AiRecommendationSeverity;
        priority?: AiRecommendationPriority;
        evidence?: Record<string, unknown>;
        resourceReference?: Record<string, unknown> | null;
        estimatedImpact?: Record<string, unknown> | null;
        confidence?: number;
        dedupeKey: string;
    }): Promise<{ recommendation: AiRecommendation; created: boolean }> {
        const existing = await this.recommendationRepository.findOne({
            where: {
                organizationId: input.organizationId,
                dedupeKey: input.dedupeKey,
                status: In(ACTIVE_STATUSES),
            },
        });

        if (existing) {
            existing.title = input.title.slice(0, 300);
            existing.description = input.description;
            existing.severity = input.severity ?? existing.severity;
            existing.priority = input.priority ?? existing.priority;
            existing.evidence = input.evidence ?? existing.evidence;
            existing.resourceReference = input.resourceReference
                ? {
                      ...(existing.resourceReference ?? {}),
                      ...input.resourceReference,
                  }
                : existing.resourceReference;
            existing.estimatedImpact = input.estimatedImpact ?? existing.estimatedImpact;
            existing.confidence = input.confidence ?? existing.confidence;
            const saved = await this.recommendationRepository.save(existing);
            return { recommendation: saved, created: false };
        }

        const created = this.recommendationRepository.create({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            agentType: input.agentType,
            category: input.category,
            title: input.title.slice(0, 300),
            description: input.description,
            severity: input.severity ?? 'medium',
            priority: input.priority ?? 'medium',
            evidence: input.evidence ?? {},
            resourceReference: input.resourceReference ?? null,
            estimatedImpact: input.estimatedImpact ?? null,
            confidence: input.confidence ?? 0,
            status: 'NEW',
            dedupeKey: input.dedupeKey,
        });

        const saved = await this.recommendationRepository.save(created);
        return { recommendation: saved, created: true };
    }

    async updateStatus(
        id: string,
        organizationId: string,
        status: AiRecommendationStatus,
        actorId?: string | null,
    ): Promise<AiRecommendation> {
        const entity = await this.findOrFail(id, organizationId);
        const allowed = ALLOWED_TRANSITIONS[entity.status] ?? [];
        if (!allowed.includes(status)) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.INVALID_RECOMMENDATION_STATUS);
        }
        const fromStatus = entity.status;
        entity.status = status;
        const saved = await this.recommendationRepository.save(entity);
        await this.auditService.record({
            organizationId,
            actorId: actorId ?? null,
            action: 'rec_status_changed',
            entityType: 'ai_recommendation',
            entityId: id,
            metadata: { fromStatus, toStatus: status },
        });
        return saved;
    }

    async markViewed(id: string, organizationId: string, actorId?: string | null): Promise<AiRecommendation> {
        const entity = await this.findOrFail(id, organizationId);
        await this.auditService.record({
            organizationId,
            actorId: actorId ?? null,
            action: 'rec_viewed',
            entityType: 'ai_recommendation',
            entityId: id,
        });
        return entity;
    }

    async patchRecommendation(
        id: string,
        organizationId: string,
        dto: {
            status?: AiRecommendationStatus;
            assigneeUserId?: string | null;
            acknowledge?: boolean;
            dismissReason?: string | null;
        },
        actorId?: string | null,
    ): Promise<AiRecommendation> {
        let entity = await this.findOrFail(id, organizationId);

        if (dto.assigneeUserId !== undefined) {
            entity.assigneeUserId = dto.assigneeUserId;
        }
        if (dto.dismissReason !== undefined) {
            entity.dismissReason = dto.dismissReason;
        }
        if (dto.acknowledge) {
            entity.acknowledgedAt = new Date();
            entity.acknowledgedByUserId = actorId ?? null;
        }

        entity = await this.recommendationRepository.save(entity);

        if (dto.status) {
            entity = await this.updateStatus(id, organizationId, dto.status, actorId);
            if (dto.dismissReason !== undefined && dto.status === 'DISMISSED') {
                entity.dismissReason = dto.dismissReason;
                entity = await this.recommendationRepository.save(entity);
            }
        }

        return entity;
    }

    async patchResourceReference(
        id: string,
        organizationId: string,
        resourceReference: Record<string, unknown>,
    ): Promise<AiRecommendation> {
        const entity = await this.findOrFail(id, organizationId);
        entity.resourceReference = resourceReference;
        return this.recommendationRepository.save(entity);
    }
}
