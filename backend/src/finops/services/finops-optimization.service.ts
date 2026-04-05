import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsRecommendation } from '../../db/entites/finops-recommendation.entity';
import { AwsEc2Instance } from '../../db/entites/aws-ec2.entity';
import { AwsRdsInstance } from '../../db/entites/aws-rds-instance.entity';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';

export interface OptimizationInsight {
    cloudAccountId: string;
    topExpensiveServices: Array<{ service: string; cost: number; currency: string }>;
    highestGrowthService: { service: string; growthPercentage: number; cost: number } | null;
    costIncreaseReasons: string[];
    totalWaste: number;
    currency: string;
}

@Injectable()
export class FinopsOptimizationService {
    private readonly logger = new Logger(FinopsOptimizationService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,

        @InjectRepository(FinopsRecommendation)
        private readonly recommendationRepo: Repository<FinopsRecommendation>,

        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repo: Repository<AwsEc2Instance>,

        @InjectRepository(AwsRdsInstance)
        private readonly rdsRepo: Repository<AwsRdsInstance>,


        @InjectRepository(AzureVirtualMachine)
        private readonly azureVmRepo: Repository<AzureVirtualMachine>,

        @InjectRepository(AzureDisk)
        private readonly azureDiskRepo: Repository<AzureDisk>,
    ) {}

    /**
     * Gera insights avançados: top serviços, maior crescimento, causas de aumento.
     */
    async generateInsights(
        organizationId: string,
        cloudAccountId: string,
    ): Promise<OptimizationInsight> {
        const now = new Date();
        const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const previousMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

        const currentMonthStartStr = currentMonthStart.toISOString().slice(0, 10);
        const previousMonthStartStr = previousMonthStart.toISOString().slice(0, 10);
        const previousMonthEndStr = previousMonthEnd.toISOString().slice(0, 10);
        const todayStr = now.toISOString().slice(0, 10);

        // Top 3 serviços mais caros (mês atual)
        const topServices = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: currentMonthStartStr })
            .andWhere('cr.date <= :end', { end: todayStr })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.service')
            .addGroupBy('cr.currency')
            .orderBy('"totalCost"', 'DESC')
            .limit(3)
            .getRawMany<{ service: string; totalCost: string; currency: string }>();

        // Crescimento mês anterior vs mês atual (normalizado para período equivalente)
        const daysElapsed = now.getUTCDate();
        const daysInPrevMonth = previousMonthEnd.getUTCDate();

        const prevServices = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: previousMonthStartStr })
            .andWhere('cr.date <= :end', { end: previousMonthEndStr })
            .andWhere('cr.granularity = :gran', { gran: 'daily' })
            .groupBy('cr.service')
            .getRawMany<{ service: string; totalCost: string }>();

        const prevMap = new Map<string, number>();
        for (const row of prevServices) {
            // Normalizar para diário para comparação justa
            prevMap.set(row.service, Number(row.totalCost) / daysInPrevMonth);
        }

        let highestGrowthService: OptimizationInsight['highestGrowthService'] = null;
        const costIncreaseReasons: string[] = [];

        for (const curr of topServices) {
            const currDailyAvg = Number(curr.totalCost) / Math.max(daysElapsed, 1);
            const prevDailyAvg = prevMap.get(curr.service) ?? 0;

            if (prevDailyAvg > 0) {
                const growth = ((currDailyAvg - prevDailyAvg) / prevDailyAvg) * 100;
                if (growth > 20) {
                    costIncreaseReasons.push(
                        `${curr.service}: +${growth.toFixed(1)}% vs mês anterior`,
                    );
                    if (!highestGrowthService || growth > highestGrowthService.growthPercentage) {
                        highestGrowthService = {
                            service: curr.service,
                            growthPercentage: growth,
                            cost: Number(curr.totalCost),
                        };
                    }
                }
            } else if (Number(curr.totalCost) > 0) {
                costIncreaseReasons.push(`${curr.service}: novo serviço este mês`);
            }
        }

        // Custo total de recomendações abertas = waste estimado
        const wasteResult = await this.recommendationRepo
            .createQueryBuilder('r')
            .select('SUM(r.potentialSaving)', 'totalWaste')
            .where('r.organizationId = :organizationId', { organizationId })
            .andWhere('r.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('r.status = :status', { status: 'open' })
            .getRawOne<{ totalWaste: string }>();

        const currency = topServices[0]?.currency ?? 'USD';

        return {
            cloudAccountId,
            topExpensiveServices: topServices.map((s) => ({
                service: s.service,
                cost: Number(s.totalCost),
                currency: s.currency,
            })),
            highestGrowthService,
            costIncreaseReasons,
            totalWaste: Number(wasteResult?.totalWaste ?? 0),
            currency,
        };
    }

    /**
     * Cruza custo (FinOps) com uso (cloud-inventory) para identificar recursos de alto custo e baixo uso.
     * Gera recomendações de otimização.
     */
    async generateCrossModuleRecommendations(
        cloudAccountId: string,
        organizationId: string,
        cloudProvider: string,
    ): Promise<void> {
        if (cloudProvider === 'aws') {
            await this.analyzeAwsResources(cloudAccountId, organizationId);
        } else if (cloudProvider === 'azure') {
            await this.analyzeAzureResources(cloudAccountId, organizationId);
        }
    }

    private async analyzeAwsResources(cloudAccountId: string, organizationId: string): Promise<void> {
        // EC2 paradas com discos EBS gerando custo
        // EC2 não tem cloudAccountId diretamente — filtra via JOIN com vpc
        const stoppedEc2 = await this.ec2Repo
            .createQueryBuilder('ec2')
            .innerJoin('ec2.vpc', 'vpc')
            .where('vpc.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('ec2.state = :state', { state: 'stopped' })
            .getMany();

        for (const ec2 of stoppedEc2) {
            const existing = await this.recommendationRepo.findOne({
                where: {
                    organizationId,
                    cloudAccountId,
                    resourceId: ec2.awsInstanceId,
                    type: 'stopped-ec2-ebs-cost',
                    status: 'open',
                },
            });

            if (!existing) {
                await this.recommendationRepo.save(
                    this.recommendationRepo.create({
                        organizationId,
                        cloudAccountId,
                        cloudProvider: 'aws',
                        type: 'stopped-ec2-ebs-cost',
                        resourceId: ec2.awsInstanceId,
                        resourceType: 'EC2 Instance',
                        description: `Instância EC2 ${ec2.awsInstanceId} (${ec2.instanceType ?? 'desconhecido'}) está parada mas continua gerando custo de EBS`,
                        recommendation: 'Considere terminar a instância e criar snapshot do EBS se os dados forem necessários, ou reinicie-a se estiver em uso',
                        potentialSaving: 5,
                        currency: 'USD',
                        priority: 'medium',
                        status: 'open',
                    }),
                );
            }
        }

        // RDS públicas (custo + risco de governança)
        const publicRds = await this.rdsRepo.find({
            where: { cloudAccountId, publiclyAccessible: true },
        });

        for (const rds of publicRds) {
            const existing = await this.recommendationRepo.findOne({
                where: {
                    organizationId,
                    cloudAccountId,
                    resourceId: rds.awsDbInstanceIdentifier,
                    type: 'public-rds-governance-risk',
                    status: 'open',
                },
            });

            if (!existing) {
                await this.recommendationRepo.save(
                    this.recommendationRepo.create({
                        organizationId,
                        cloudAccountId,
                        cloudProvider: 'aws',
                        type: 'public-rds-governance-risk',
                        resourceId: rds.awsDbInstanceIdentifier,
                        resourceType: 'RDS Instance',
                        description: `RDS ${rds.awsDbInstanceIdentifier} está publicamente acessível — risco de segurança E custo de transferência de dados`,
                        recommendation: 'Desabilite o acesso público e use VPC endpoints ou bastion host',
                        potentialSaving: null,
                        currency: 'USD',
                        priority: 'high',
                        status: 'open',
                    }),
                );
            }
        }
    }

    private async analyzeAzureResources(cloudAccountId: string, organizationId: string): Promise<void> {
        // VMs desalocadas gerando custo de disco
        const deallocatedVms = await this.azureVmRepo.find({
            where: { cloudAccountId, provisioningState: 'VM deallocated' },
        });

        for (const vm of deallocatedVms) {
            const existing = await this.recommendationRepo.findOne({
                where: {
                    organizationId,
                    cloudAccountId,
                    resourceId: vm.azureId,
                    type: 'deallocated-vm-disk-cost',
                    status: 'open',
                },
            });

            if (!existing) {
                await this.recommendationRepo.save(
                    this.recommendationRepo.create({
                        organizationId,
                        cloudAccountId,
                        cloudProvider: 'azure',
                        type: 'deallocated-vm-disk-cost',
                        resourceId: vm.azureId,
                        resourceType: 'Azure VM',
                        description: `VM ${vm.name} está desalocada mas os managed disks continuam gerando custo`,
                        recommendation: 'Delete a VM e seus discos se não forem necessários, ou capture uma imagem antes de deletar',
                        potentialSaving: null,
                        currency: 'USD',
                        priority: 'medium',
                        status: 'open',
                    }),
                );
            }
        }

        // Discos não anexados
        const unattachedDisks = await this.azureDiskRepo.find({
            where: { cloudAccountId, diskState: 'Unattached' },
        });

        for (const disk of unattachedDisks) {
            const existing = await this.recommendationRepo.findOne({
                where: {
                    organizationId,
                    cloudAccountId,
                    resourceId: disk.azureId,
                    type: 'unattached-disk',
                    status: 'open',
                },
            });

            if (!existing) {
                await this.recommendationRepo.save(
                    this.recommendationRepo.create({
                        organizationId,
                        cloudAccountId,
                        cloudProvider: 'azure',
                        type: 'unattached-disk',
                        resourceId: disk.azureId,
                        resourceType: 'Azure Disk',
                        description: `Disco ${disk.name} (${disk.diskSizeGb ?? '?'}GB) não está anexado a nenhuma VM`,
                        recommendation: 'Delete o disco se não for necessário para reduzir custos',
                        potentialSaving: null,
                        currency: 'USD',
                        priority: 'medium',
                        status: 'open',
                    }),
                );
            }
        }
    }
}
