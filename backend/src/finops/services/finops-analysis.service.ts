import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { AwsEc2Instance } from '../../db/entites/aws-ec2.entity';
import { AwsRdsInstance } from '../../db/entites/aws-rds-instance.entity';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CostByServiceItem {
    service: string;
    currentMonthCost: number;
    previousMonthCost: number;
    change: number;
    changePercentage: number;
    trend: 'up' | 'down' | 'stable';
    currency: string;
}

export interface CostSummary {
    totalCost: number;
    currency: string;
    topServices: ServiceCostBreakdown[];
    byCloud: CloudCostBreakdown[];
    trend: CostTrend;
}

export interface ServiceCostBreakdown {
    service: string;
    cost: number;
    percentage: number;
}

export interface CloudCostBreakdown {
    cloudProvider: string;
    cost: number;
    percentage: number;
}

export interface CostTrend {
    currentPeriodCost: number;
    previousPeriodCost: number;
    growthAmount: number;
    growthPercentage: number;
}

export interface FinopsScore {
    score: number;
    efficiencyScore: number;
    wasteScore: number;
    growthScore: number;
    label: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    insights: string[];
}

export interface PricingInfo {
    cloudAccountId: string;
    totalCost: number;
    markupPercentage: number;
    finalPrice: number;
    currency: string;
}

export interface MarginInfo {
    cloudAccountId: string;
    realCost: number;
    revenue: number;
    marginAmount: number;
    marginPercentage: number;
    currency: string;
}

export interface SavingOpportunity {
    potentialSaving: number;
    savingPercentage: number;
    currency: string;
    topRecommendations: Array<{
        type: string;
        description: string;
        saving: number;
    }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class FinopsAnalysisService {
    private readonly logger = new Logger(FinopsAnalysisService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsRecommendation)
        private readonly recommendationRepo: Repository<FinopsRecommendation>,

        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repo: Repository<AwsEc2Instance>,

        @InjectRepository(AwsRdsInstance)
        private readonly rdsRepo: Repository<AwsRdsInstance>,

        @InjectRepository(AwsS3Bucket)
        private readonly s3Repo: Repository<AwsS3Bucket>,

        @InjectRepository(AzureVirtualMachine)
        private readonly azureVmRepo: Repository<AzureVirtualMachine>,

        @InjectRepository(AzureDisk)
        private readonly azureDiskRepo: Repository<AzureDisk>,
    ) {}

    // =========================================================================
    // Dashboard Summary
    // =========================================================================

    /**
     * Retorna o resumo de custos para o dashboard FinOps de uma conta.
     * Considera os últimos 30 dias por padrão.
     */
    async getDashboardSummary(cloudAccountId: string, organizationId: string): Promise<CostSummary> {
        const now = new Date();
        // Use start-of-day to get clean date boundaries for the DATE column
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // exclusive upper bound
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
        const sixtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59);

        const [currentRecords, previousRecords] = await Promise.all([
            this.getRecordsForPeriod(cloudAccountId, organizationId, thirtyDaysAgo, today),
            this.getRecordsForPeriod(cloudAccountId, organizationId, sixtyDaysAgo, thirtyDaysAgo),
        ]);

        const totalCost = currentRecords.reduce((sum, r) => sum + Number(r.cost), 0);
        const previousTotalCost = previousRecords.reduce((sum, r) => sum + Number(r.cost), 0);
        const currency = currentRecords[0]?.currency ?? 'USD';

        const topServices = this.computeServiceBreakdown(currentRecords, totalCost);
        const byCloud = this.computeCloudBreakdown(currentRecords, totalCost);
        const trend = this.computeTrend(totalCost, previousTotalCost);

        return { totalCost, currency, topServices, byCloud, trend };
    }

    /**
     * Retorna histórico de custo por período com granularidade flexível.
     */
    async getCostHistory(
        cloudAccountId: string,
        organizationId: string,
        granularity: 'daily' | 'monthly',
        startDate: Date,
        endDate: Date,
    ): Promise<Array<{ date: string; cost: number; currency: string }>> {
        const records = await this.costRecordRepo
            .createQueryBuilder('r')
            .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.granularity = :granularity', { granularity })
            .andWhere('r.date >= :startDate', { startDate })
            .andWhere('r.date <= :endDate', { endDate })
            .orderBy('r.date', 'ASC')
            .getMany();

        const grouped = new Map<string, { cost: number; currency: string }>();

        for (const r of records) {
            const dateKey = r.date instanceof Date
                ? r.date.toISOString().slice(0, 10)
                : String(r.date);
            const existing = grouped.get(dateKey);

            if (existing) {
                existing.cost += Number(r.cost);
            } else {
                grouped.set(dateKey, { cost: Number(r.cost), currency: r.currency });
            }
        }

        return Array.from(grouped.entries()).map(([date, { cost, currency }]) => ({ date, cost, currency }));
    }

    // =========================================================================
    // FinOps Score
    // =========================================================================

    /**
     * Calcula o score FinOps da conta com base em eficiência, desperdício
     * e crescimento de custo.
     */
    async computeFinopsScore(cloudAccountId: string, organizationId: string): Promise<FinopsScore> {
        const summary = await this.getDashboardSummary(cloudAccountId, organizationId);
        const openRecommendations = await this.recommendationRepo.find({
            where: { cloudAccountId, organizationId, status: 'open' },
        });

        const totalPotentialSaving = openRecommendations.reduce((sum, r) => sum + Number(r.potentialSaving ?? 0), 0);

        // Eficiência: quanto maior o desperdício relativo, menor o score
        const wasteRatio = summary.totalCost > 0 ? totalPotentialSaving / summary.totalCost : 0;
        const efficiencyScore = Math.max(0, Math.round(100 - wasteRatio * 100));

        // Crescimento: crescimento acima de 20% penaliza o score
        const growthPenalty = Math.min(30, Math.max(0, (summary.trend.growthPercentage - 20) / 2));
        const growthScore = Math.max(0, Math.round(70 - growthPenalty));

        // Desperdício: proporção inversa de recomendações abertas vs custo total
        const wasteScore = Math.max(0, Math.round(100 - wasteRatio * 150));

        const score = Math.round((efficiencyScore * 0.5) + (growthScore * 0.3) + (wasteScore * 0.2));

        const label = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';

        const insights = this.generateInsights(summary, openRecommendations.length, totalPotentialSaving);

        return { score, efficiencyScore, wasteScore, growthScore, label, insights };
    }

    // =========================================================================
    // Monetização
    // =========================================================================

    /**
     * Calcula o preço final com markup aplicado sobre o custo real da conta.
     */
    async computePricing(cloudAccountId: string, organizationId: string, markupPercentage: number): Promise<PricingInfo> {
        const summary = await this.getDashboardSummary(cloudAccountId, organizationId);
        const finalPrice = summary.totalCost * (1 + markupPercentage / 100);

        return {
            cloudAccountId,
            totalCost: summary.totalCost,
            markupPercentage,
            finalPrice,
            currency: summary.currency,
        };
    }

    /**
     * Calcula a margem do cliente com base no custo real e na receita gerada.
     */
    computeMargin(cloudAccountId: string, realCost: number, revenue: number, currency = 'USD'): MarginInfo {
        const marginAmount = revenue - realCost;
        const marginPercentage = revenue > 0 ? (marginAmount / revenue) * 100 : 0;

        return {
            cloudAccountId,
            realCost,
            revenue,
            marginAmount,
            marginPercentage,
            currency,
        };
    }

    /**
     * Calcula a economia potencial com base nas recomendações abertas.
     */
    async computeSavingOpportunity(cloudAccountId: string, organizationId: string): Promise<SavingOpportunity> {
        const [summary, recommendations] = await Promise.all([
            this.getDashboardSummary(cloudAccountId, organizationId),
            this.recommendationRepo.find({
                where: { cloudAccountId, organizationId, status: 'open' },
                order: { potentialSaving: 'DESC' },
                take: 10,
            }),
        ]);

        const totalSaving = recommendations.reduce((sum, r) => sum + Number(r.potentialSaving ?? 0), 0);
        const savingPercentage = summary.totalCost > 0 ? (totalSaving / summary.totalCost) * 100 : 0;

        const topRecommendations = recommendations.slice(0, 3).map((r) => ({
            type: r.type,
            description: r.description,
            saving: Number(r.potentialSaving ?? 0),
        }));

        return {
            potentialSaving: totalSaving,
            savingPercentage,
            currency: summary.currency,
            topRecommendations,
        };
    }

    // =========================================================================
    // Optimization Engine
    // =========================================================================

    /**
     * Analisa os recursos sincronizados e gera recomendações de otimização.
     * Persiste as recomendações no banco (remove as antigas antes de inserir).
     */
    async generateRecommendations(cloudAccountId: string, organizationId: string, cloudProvider: string): Promise<FinopsRecommendation[]> {
        this.logger.log(`Gerando recomendações para conta ${cloudAccountId} (${cloudProvider})`);

        // Remove recomendações antigas abertas para esta conta
        await this.recommendationRepo.delete({ cloudAccountId, organizationId, status: 'open' });

        const recommendations: Partial<FinopsRecommendation>[] = [];

        if (cloudProvider === 'aws') {
            const awsRecs = await this.analyzeAwsResources(cloudAccountId, organizationId);
            recommendations.push(...awsRecs);
        } else if (cloudProvider === 'azure') {
            const azureRecs = await this.analyzeAzureResources(cloudAccountId, organizationId);
            recommendations.push(...azureRecs);
        }

        if (recommendations.length === 0) {
            return [];
        }

        const saved = await this.recommendationRepo.save(
            recommendations.map((r) => this.recommendationRepo.create(r as FinopsRecommendation)),
        );

        this.logger.log(`${saved.length} recomendações geradas para conta ${cloudAccountId}`);

        return saved;
    }

    /**
     * Retorna custo por serviço para o mês especificado, comparado ao mês anterior.
     */
    async getCostByService(
        cloudAccountId: string,
        organizationId: string,
        year: number,
        month: number,
    ): Promise<CostByServiceItem[]> {
        // Use ISO date strings to avoid timezone conversion issues with DATE columns
        const pad = (n: number) => String(n).padStart(2, '0');
        const startOfMonth = `${year}-${pad(month)}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const endOfMonth = `${nextYear}-${pad(nextMonth)}-01`;
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const startOfPrevMonth = `${prevYear}-${pad(prevMonth)}-01`;

        // Resolve granularity independently for each period to avoid double-counting
        const [currentGranularity, prevGranularity] = await Promise.all([
            this.resolveGranularity(cloudAccountId, organizationId, startOfMonth, endOfMonth),
            this.resolveGranularity(cloudAccountId, organizationId, startOfPrevMonth, startOfMonth),
        ]);

        interface RawServiceRow { service: string; totalCost: string; currency: string }

        const [currentRows, previousRows] = await Promise.all([
            this.costRecordRepo
                .createQueryBuilder('r')
                .select('r.service', 'service')
                .addSelect('SUM(r.cost)', 'totalCost')
                .addSelect('MAX(r.currency)', 'currency')
                .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
                .andWhere('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.granularity = :granularity', { granularity: currentGranularity })
                .andWhere('r.date >= :start', { start: startOfMonth })
                .andWhere('r.date < :end', { end: endOfMonth })
                .groupBy('r.service')
                .orderBy('SUM(r.cost)', 'DESC')
                .getRawMany<RawServiceRow>(),
            this.costRecordRepo
                .createQueryBuilder('r')
                .select('r.service', 'service')
                .addSelect('SUM(r.cost)', 'totalCost')
                .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
                .andWhere('r.organizationId = :organizationId', { organizationId })
                .andWhere('r.granularity = :granularity', { granularity: prevGranularity })
                .andWhere('r.date >= :start', { start: startOfPrevMonth })
                .andWhere('r.date < :end', { end: startOfMonth })
                .groupBy('r.service')
                .getRawMany<RawServiceRow>(),
        ]);

        const prevMap = new Map<string, number>();
        for (const row of previousRows) {
            prevMap.set(row.service, Number(row.totalCost));
        }

        return currentRows.map((row) => {
            const currentMonthCost = Number(row.totalCost);
            const previousMonthCost = prevMap.get(row.service) ?? 0;
            const change = currentMonthCost - previousMonthCost;
            const changePercentage =
                previousMonthCost > 0
                    ? (change / previousMonthCost) * 100
                    : currentMonthCost > 0
                      ? 100
                      : 0;
            const trend: 'up' | 'down' | 'stable' =
                Math.abs(changePercentage) < 5 ? 'stable' : change > 0 ? 'up' : 'down';

            return {
                service: row.service,
                currentMonthCost,
                previousMonthCost,
                change,
                changePercentage,
                trend,
                currency: row.currency ?? 'USD',
            };
        });
    }

    async listRecommendations(cloudAccountId: string, organizationId: string): Promise<FinopsRecommendation[]> {
        return this.recommendationRepo.find({
            where: { cloudAccountId, organizationId, status: 'open' },
            order: { priority: 'DESC', potentialSaving: 'DESC' },
        });
    }

    async dismissRecommendation(id: string, cloudAccountId: string, organizationId: string): Promise<void> {
        const rec = await this.recommendationRepo.findOne({ where: { id, cloudAccountId, organizationId } });

        if (!rec) {
            return;
        }

        await this.recommendationRepo.update(id, { status: 'dismissed' });
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Detecta a granularidade dominante no período.
     * Prefere 'daily' quando há registros diários; senão usa 'monthly'.
     * Evita dupla contagem quando o scheduler cria registros de ambas as granularidades.
     */
    private async resolveGranularity(
        cloudAccountId: string,
        organizationId: string,
        from: string,
        to: string,
    ): Promise<'daily' | 'monthly'> {
        const count = await this.costRecordRepo
            .createQueryBuilder('r')
            .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.granularity = :granularity', { granularity: 'daily' })
            .andWhere('r.date >= :from', { from })
            .andWhere('r.date < :to', { to })
            .getCount();
        return count > 0 ? 'daily' : 'monthly';
    }

    private toIsoDate(d: Date): string {
        return d.toISOString().slice(0, 10);
    }

    private async getRecordsForPeriod(
        cloudAccountId: string,
        organizationId: string,
        from: Date,
        to: Date,
    ): Promise<FinopsCostRecord[]> {
        const fromStr = this.toIsoDate(from);
        const toStr = this.toIsoDate(to);
        const granularity = await this.resolveGranularity(cloudAccountId, organizationId, fromStr, toStr);

        return this.costRecordRepo
            .createQueryBuilder('r')
            .where('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.granularity = :granularity', { granularity })
            .andWhere('r.date >= :from', { from: fromStr })
            .andWhere('r.date < :to', { to: toStr })
            .getMany();
    }

    private computeServiceBreakdown(records: FinopsCostRecord[], totalCost: number): ServiceCostBreakdown[] {
        const serviceMap = new Map<string, number>();

        for (const r of records) {
            const current = serviceMap.get(r.service) ?? 0;
            serviceMap.set(r.service, current + Number(r.cost));
        }

        return Array.from(serviceMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([service, cost]) => ({
                service,
                cost,
                percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
            }));
    }

    private computeCloudBreakdown(records: FinopsCostRecord[], totalCost: number): CloudCostBreakdown[] {
        const providerMap = new Map<string, number>();

        for (const r of records) {
            const current = providerMap.get(r.cloudProvider) ?? 0;
            providerMap.set(r.cloudProvider, current + Number(r.cost));
        }

        return Array.from(providerMap.entries()).map(([cloudProvider, cost]) => ({
            cloudProvider,
            cost,
            percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
        }));
    }

    private computeTrend(current: number, previous: number): CostTrend {
        const growthAmount = current - previous;
        const growthPercentage = previous > 0 ? (growthAmount / previous) * 100 : 0;

        return {
            currentPeriodCost: current,
            previousPeriodCost: previous,
            growthAmount,
            growthPercentage,
        };
    }

    private generateInsights(summary: CostSummary, openRecsCount: number, totalSaving: number): string[] {
        const insights: string[] = [];

        if (summary.trend.growthPercentage > 20) {
            insights.push(
                `Seu custo aumentou ${summary.trend.growthPercentage.toFixed(1)}% comparado ao período anterior.`,
            );
        }

        if (summary.topServices.length > 0) {
            const top3 = summary.topServices.slice(0, 3).map((s) => s.service).join(', ');
            insights.push(`Top 3 serviços por custo: ${top3}.`);
        }

        if (openRecsCount > 0 && totalSaving > 0) {
            insights.push(
                `Você pode economizar até ${totalSaving.toFixed(2)} ${summary.currency} com ${openRecsCount} otimizações disponíveis.`,
            );
        }

        if (summary.totalCost === 0) {
            insights.push('Nenhum dado de custo coletado ainda. Execute uma sincronização FinOps para ver insights.');
        }

        return insights;
    }

    // ─── AWS Resource Analysis ────────────────────────────────────────────────

    private async analyzeAwsResources(
        cloudAccountId: string,
        organizationId: string,
    ): Promise<Partial<FinopsRecommendation>[]> {
        const recommendations: Partial<FinopsRecommendation>[] = [];

        // EC2: instâncias stopped — podem gerar custos de EBS anexado.
        // EC2 não tem cloudAccountId direto; filtra via join com VPC.
        const stoppedEc2 = await this.ec2Repo
            .createQueryBuilder('ec2')
            .innerJoin('aws_vpcs', 'vpc', 'vpc.id = ec2.vpc_id AND vpc.cloud_account_id = :cloudAccountId', { cloudAccountId })
            .andWhere('ec2.state = :state', { state: 'stopped' })
            .getMany();

        for (const ec2 of stoppedEc2) {
            recommendations.push({
                organizationId,
                cloudAccountId,
                cloudProvider: 'aws',
                type: 'underutilized_ec2',
                resourceId: ec2.awsInstanceId,
                resourceType: 'EC2Instance',
                description: `Instância EC2 ${ec2.awsInstanceId} (${ec2.instanceType}) está parada e pode estar gerando custos de EBS anexado.`,
                recommendation: 'Considere terminar a instância ou criar um snapshot e terminar para reduzir custos.',
                potentialSaving: this.estimateEc2EbsSaving(ec2.instanceType),
                currency: 'USD',
                priority: 'medium',
                metadata: { instanceType: ec2.instanceType },
                status: 'open',
            });
        }

        // RDS: instâncias publicly accessible (risco de segurança + custo)
        const publicRds = await this.rdsRepo.find({
            where: { cloudAccountId, publiclyAccessible: true },
        });

        for (const rds of publicRds) {
            recommendations.push({
                organizationId,
                cloudAccountId,
                cloudProvider: 'aws',
                type: 'oversized_rds',
                resourceId: rds.awsDbInstanceIdentifier,
                resourceType: 'RDSInstance',
                description: `Instância RDS ${rds.awsDbInstanceIdentifier} está acessível publicamente, o que pode indicar superdimensionamento ou má configuração.`,
                recommendation: 'Avalie se a instância RDS precisa de acesso público. Restrinja o acesso para reduzir custos de transferência de dados e risco de segurança.',
                potentialSaving: 25.00,
                currency: 'USD',
                priority: 'high',
                metadata: { engine: rds.engine, dbInstanceClass: rds.dbInstanceClass },
                status: 'open',
            });
        }

        return recommendations;
    }

    // ─── Savings Estimators ───────────────────────────────────────────────────

    /** Estima custo mensal de EBS para instância EC2 parada (baseado no tipo). */
    private estimateEc2EbsSaving(instanceType: string | null): number {
        if (!instanceType) return 10.00;
        const type = instanceType.toLowerCase();
        if (type.startsWith('t2.nano') || type.startsWith('t3.nano')) return 5.00;
        if (type.startsWith('t2.micro') || type.startsWith('t3.micro')) return 8.00;
        if (type.startsWith('t2.small') || type.startsWith('t3.small')) return 10.00;
        if (type.startsWith('t2.medium') || type.startsWith('t3.medium')) return 15.00;
        if (type.startsWith('t2.large') || type.startsWith('t3.large')) return 20.00;
        if (type.startsWith('m5') || type.startsWith('m6')) return 25.00;
        if (type.startsWith('c5') || type.startsWith('c6')) return 20.00;
        if (type.startsWith('r5') || type.startsWith('r6')) return 30.00;
        return 15.00;
    }

    /** Estima custo mensal de disco Azure não anexado (baseado em tamanho e SKU). */
    private estimateDiskSaving(diskSizeGb: number | null, sku: string | null): number {
        const size = diskSizeGb ?? 128;
        const pricePerGb = sku?.toLowerCase().includes('premium') ? 0.17 : 0.05;
        return Math.round(size * pricePerGb * 100) / 100;
    }

    // ─── Azure Resource Analysis ──────────────────────────────────────────────

    private async analyzeAzureResources(
        cloudAccountId: string,
        organizationId: string,
    ): Promise<Partial<FinopsRecommendation>[]> {
        const recommendations: Partial<FinopsRecommendation>[] = [];

        // VMs deallocated (provisioningState indica estado de provisionamento; recursos parados têm Deallocated)
        const deallocatedVms = await this.azureVmRepo.find({
            where: { cloudAccountId, provisioningState: 'Deallocated' },
        });

        for (const vm of deallocatedVms) {
            recommendations.push({
                organizationId,
                cloudAccountId,
                cloudProvider: 'azure',
                type: 'underutilized_vm',
                resourceId: vm.azureId,
                resourceType: 'VirtualMachine',
                description: `VM Azure ${vm.name} está desalocada e pode estar gerando custos de disco gerenciado.`,
                recommendation: 'Considere deletar a VM ou fazer snapshot dos discos e deletá-los para reduzir custos de armazenamento.',
                potentialSaving: 20.00,
                currency: 'USD',
                priority: 'medium',
                metadata: { vmSize: vm.vmSize, location: vm.location },
                status: 'open',
            });
        }

        // Discos não anexados
        const unattachedDisks = await this.azureDiskRepo.find({
            where: { cloudAccountId, diskState: 'Unattached' },
        });

        for (const disk of unattachedDisks) {
            recommendations.push({
                organizationId,
                cloudAccountId,
                cloudProvider: 'azure',
                type: 'unused_disk',
                resourceId: disk.azureId,
                resourceType: 'ManagedDisk',
                description: `Disco Azure ${disk.name} está desanexado e gerando custo de armazenamento sem utilização.`,
                recommendation: 'Delete o disco ou crie um snapshot e delete-o para eliminar o custo de armazenamento.',
                potentialSaving: this.estimateDiskSaving(disk.diskSizeGb, disk.sku),
                currency: 'USD',
                priority: 'high',
                metadata: { diskSizeGb: disk.diskSizeGb, sku: disk.sku, location: disk.location },
                status: 'open',
            });
        }

        return recommendations;
    }
}
