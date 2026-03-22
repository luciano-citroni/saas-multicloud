import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureWebApp } from '../../db/entites/azure-web-app.entity';
import { AzureAppServicePlan } from '../../db/entites/azure-app-service-plan.entity';

interface ArgResource {
    id: string;
    name: string;
    type: string;
    location?: string | null;
    resourceGroup?: string | null;
    subscriptionId?: string | null;
    tags?: Record<string, string> | null;
    properties?: Record<string, any> | null;
}

const BATCH = 200;

@Injectable()
export class AzureWebService {
    constructor(
        @InjectRepository(AzureWebApp)
        private readonly webAppRepo: Repository<AzureWebApp>,
        @InjectRepository(AzureAppServicePlan)
        private readonly aspRepo: Repository<AzureAppServicePlan>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertWebApps(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.webAppRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            kind: (r as any)?.kind ?? null,
            state: (r.properties as any)?.state ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.webAppRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listWebApps(cloudAccountId: string, orgId: string): Promise<AzureWebApp[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.webAppRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getWebApp(id: string, cloudAccountId: string, orgId: string): Promise<AzureWebApp> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.webAppRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertAppServicePlans(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.aspRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            sku: (r.properties as any)?.sku?.name ?? null,
            kind: (r as any)?.kind ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.aspRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listAppServicePlans(cloudAccountId: string, orgId: string): Promise<AzureAppServicePlan[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.aspRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getAppServicePlan(id: string, cloudAccountId: string, orgId: string): Promise<AzureAppServicePlan> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.aspRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
