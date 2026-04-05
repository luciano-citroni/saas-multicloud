import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsTenantBilling } from '../../db/entites/finops-tenant-billing.entity';

export interface BillingRecord {
    cloudAccountId: string;
    periodStart: string;
    periodEnd: string;
    cloudCost: number;
    markupPercentage: number;
    markupAmount: number;
    finalPrice: number;
    margin: number;
    marginPercentage: number;
    currency: string;
    chargebackBreakdown: ChargebackItem[];
}

export interface ChargebackItem {
    groupKey: string; // tag value, project, or team
    groupType: 'tag' | 'service' | 'region';
    cost: number;
    percentage: number;
    currency: string;
}

@Injectable()
export class FinopsMonetizationService {
    private readonly logger = new Logger(FinopsMonetizationService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsTenantBilling)
        private readonly billingRepo: Repository<FinopsTenantBilling>,
    ) {}

    /**
     * Calcula e persiste o billing de um período com markup aplicado.
     */
    async computeAndSaveBilling(
        organizationId: string,
        cloudAccountId: string,
        startDate: string,
        endDate: string,
        markupPercentage: number,
    ): Promise<BillingRecord> {
        const result = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: startDate })
            .andWhere('cr.date <= :end', { end: endDate })
            .groupBy('cr.currency')
            .getRawOne<{ totalCost: string; currency: string }>();

        const cloudCost = Number(result?.totalCost ?? 0);
        const currency = result?.currency ?? 'USD';
        const markup = markupPercentage / 100;
        const markupAmount = cloudCost * markup;
        const finalPrice = cloudCost + markupAmount;
        const margin = markupAmount;
        const marginPercentage = cloudCost > 0 ? (margin / finalPrice) * 100 : 0;

        // Chargeback por serviço
        const chargebackRows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'groupKey')
            .addSelect('SUM(cr.cost)', 'cost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: startDate })
            .andWhere('cr.date <= :end', { end: endDate })
            .groupBy('cr.service')
            .addGroupBy('cr.currency')
            .orderBy('"cost"', 'DESC')
            .getRawMany<{ groupKey: string; cost: string; currency: string }>();

        const chargebackBreakdown: ChargebackItem[] = chargebackRows.map((row) => ({
            groupKey: row.groupKey,
            groupType: 'service' as const,
            cost: Number(row.cost),
            percentage: cloudCost > 0 ? (Number(row.cost) / cloudCost) * 100 : 0,
            currency: row.currency,
        }));

        // Persist billing record
        await this.billingRepo.upsert(
            {
                organizationId,
                cloudAccountId,
                periodStart: new Date(startDate + 'T00:00:00Z'),
                periodEnd: new Date(endDate + 'T00:00:00Z'),
                cloudCost,
                markupPercentage,
                markupAmount,
                finalPrice,
                margin,
                marginPercentage,
                currency,
                status: 'draft',
                chargebackBreakdown: chargebackBreakdown as any,
            } as any,
            {
                conflictPaths: ['organizationId', 'cloudAccountId', 'periodStart', 'periodEnd'],
                skipUpdateIfNoValuesChanged: false,
            },
        );

        this.logger.log(
            `[Monetization] Billing calculado para ${cloudAccountId}: custo=${cloudCost.toFixed(2)}, markup=${markupPercentage}%, preço final=${finalPrice.toFixed(2)} ${currency}`,
        );

        return {
            cloudAccountId,
            periodStart: startDate,
            periodEnd: endDate,
            cloudCost,
            markupPercentage,
            markupAmount,
            finalPrice,
            margin,
            marginPercentage,
            currency,
            chargebackBreakdown,
        };
    }

    /**
     * Lista histórico de billing de uma conta.
     */
    async getBillingHistory(
        organizationId: string,
        cloudAccountId: string,
        limit = 12,
    ): Promise<FinopsTenantBilling[]> {
        return this.billingRepo.find({
            where: { organizationId, cloudAccountId },
            order: { periodStart: 'DESC' },
            take: limit,
        });
    }

    /**
     * Chargeback agrupado por tag de um período.
     */
    async getChargebackByTag(
        organizationId: string,
        cloudAccountId: string,
        tagKey: string,
        startDate: string,
        endDate: string,
    ): Promise<ChargebackItem[]> {
        // Tags são armazenadas como JSONB - extrair valor da tag específica
        const rows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select(`cr.tags->>'${tagKey}'`, 'tagValue')
            .addSelect('SUM(cr.cost)', 'cost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: startDate })
            .andWhere('cr.date <= :end', { end: endDate })
            .andWhere(`cr.tags ? '${tagKey}'`)
            .groupBy(`cr.tags->>'${tagKey}'`)
            .addGroupBy('cr.currency')
            .orderBy('"cost"', 'DESC')
            .getRawMany<{ tagValue: string; cost: string; currency: string }>();

        const totalCost = rows.reduce((sum, row) => sum + Number(row.cost), 0);

        return rows.map((row) => ({
            groupKey: row.tagValue ?? '(sem tag)',
            groupType: 'tag' as const,
            cost: Number(row.cost),
            percentage: totalCost > 0 ? (Number(row.cost) / totalCost) * 100 : 0,
            currency: row.currency,
        }));
    }
}
