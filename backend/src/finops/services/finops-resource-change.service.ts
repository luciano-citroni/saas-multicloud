import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { FinopsResourceChangeEvent } from '../../db/entites/finops-resource-change-event.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

export type ResourceChangeFieldDiff = {
    field: string;
    previousValue: string;
    newValue: string;
};

export type ResourceChangeCause = {
    field: string;
    previousValue: string;
    newValue: string;
    detectedAt: string;
    resourceType: string;
};

@Injectable()
export class FinopsResourceChangeService {
    private readonly logger = new Logger(FinopsResourceChangeService.name);

    constructor(
        @InjectRepository(FinopsResourceChangeEvent)
        private readonly changeRepo: Repository<FinopsResourceChangeEvent>,

        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,
    ) {}

    /**
     * Persiste diffs de configuração detectados no upsert de inventário.
     * Resolve organizationId via cloud account quando não informado.
     */
    async recordFieldChanges(params: {
        cloudAccountId: string;
        organizationId?: string;
        cloudProvider: string;
        resourceType: string;
        resourceId: string;
        changes: ResourceChangeFieldDiff[];
        detectedAt?: Date;
    }): Promise<void> {
        const meaningful = params.changes.filter(
            (c) => String(c.previousValue ?? '') !== String(c.newValue ?? ''),
        );
        if (!meaningful.length || !params.resourceId) return;

        let organizationId = params.organizationId;
        if (!organizationId) {
            const account = await this.cloudAccountRepo.findOne({
                where: { id: params.cloudAccountId },
                select: ['id', 'tenantId'],
            });
            organizationId = account?.tenantId;
        }
        if (!organizationId) {
            this.logger.warn(
                `[ResourceChange] Conta ${params.cloudAccountId} sem tenant — evento ignorado (${params.resourceId})`,
            );
            return;
        }

        const detectedAt = params.detectedAt ?? new Date();
        const rows = meaningful.map((change) =>
            this.changeRepo.create({
                organizationId,
                cloudAccountId: params.cloudAccountId,
                cloudProvider: params.cloudProvider,
                resourceType: params.resourceType,
                resourceId: params.resourceId,
                field: change.field,
                previousValue: String(change.previousValue ?? ''),
                newValue: String(change.newValue ?? ''),
                detectedAt,
            }),
        );

        await this.changeRepo.save(rows);
    }

    /**
     * Lista mudanças de inventário na conta no intervalo (ex.: resize EC2 próximo à anomalia).
     */
    async listForAccount(
        organizationId: string,
        cloudAccountId: string,
        from: Date,
        to: Date,
        resourceTypes?: string[],
    ): Promise<FinopsResourceChangeEvent[]> {
        const qb = this.changeRepo
            .createQueryBuilder('e')
            .where('e.organizationId = :organizationId', { organizationId })
            .andWhere('e.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('e.detectedAt >= :from', { from })
            .andWhere('e.detectedAt <= :to', { to })
            .orderBy('e.detectedAt', 'DESC')
            .take(500);

        if (resourceTypes?.length) {
            qb.andWhere('e.resourceType IN (:...resourceTypes)', { resourceTypes });
        }

        return qb.getMany();
    }

    /**
     * Lista mudanças recentes para um conjunto de resourceIds (match exato ou sufixo / contains).
     */
    async listForResources(
        organizationId: string,
        cloudAccountId: string,
        resourceIds: string[],
        from: Date,
        to: Date,
    ): Promise<FinopsResourceChangeEvent[]> {
        if (!resourceIds.length) return [];

        const normalized = Array.from(
            new Set(
                resourceIds
                    .map((id) => id.trim())
                    .filter(Boolean)
                    .flatMap((id) => {
                        const short = this.shortResourceId(id);
                        return short && short !== id ? [id, short] : [id];
                    }),
            ),
        );

        const exact = await this.changeRepo.find({
            where: {
                organizationId,
                cloudAccountId,
                resourceId: In(normalized),
            },
            order: { detectedAt: 'DESC' },
            take: 500,
        });

        const filteredExact = exact.filter((e) => e.detectedAt >= from && e.detectedAt <= to);
        if (filteredExact.length > 0) return filteredExact;

        // Fallback: ARN / path contains short ids (ex.: i-abc in arn:aws:ec2:...:instance/i-abc)
        const qb = this.changeRepo
            .createQueryBuilder('e')
            .where('e.organizationId = :organizationId', { organizationId })
            .andWhere('e.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('e.detectedAt >= :from', { from })
            .andWhere('e.detectedAt <= :to', { to })
            .orderBy('e.detectedAt', 'DESC')
            .take(500);

        const all = await qb.getMany();
        const needles = normalized.map((id) => id.toLowerCase());

        return all.filter((event) => {
            const hay = event.resourceId.toLowerCase();
            return needles.some((n) => hay === n || hay.endsWith(n) || hay.includes(n));
        });
    }

    toCauses(events: FinopsResourceChangeEvent[]): ResourceChangeCause[] {
        return events.map((e) => ({
            field: e.field,
            previousValue: e.previousValue,
            newValue: e.newValue,
            detectedAt: e.detectedAt.toISOString(),
            resourceType: e.resourceType,
        }));
    }

    shortResourceId(resourceId: string): string {
        const trimmed = resourceId.trim();
        if (!trimmed) return '';
        if (trimmed.includes('/')) {
            const parts = trimmed.split('/').filter(Boolean);
            return parts[parts.length - 1] ?? trimmed;
        }
        if (trimmed.startsWith('arn:')) {
            const parts = trimmed.split('/');
            return parts[parts.length - 1] ?? trimmed;
        }
        return trimmed;
    }

    matchEventsForResource(
        events: FinopsResourceChangeEvent[],
        resourceId: string,
    ): FinopsResourceChangeEvent[] {
        const short = this.shortResourceId(resourceId).toLowerCase();
        const full = resourceId.toLowerCase();
        return events.filter((e) => {
            const id = e.resourceId.toLowerCase();
            return id === full || id === short || id.endsWith(short) || id.includes(short) || full.includes(id);
        });
    }
}
