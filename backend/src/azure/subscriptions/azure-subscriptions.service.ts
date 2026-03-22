import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureSubscription } from '../../db/entites/azure-subscription.entity';
import { AzureResourceGroup } from '../../db/entites/azure-resource-group.entity';

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
export class AzureSubscriptionsService {
    constructor(
        @InjectRepository(AzureSubscription)
        private readonly subscriptionRepo: Repository<AzureSubscription>,
        @InjectRepository(AzureResourceGroup)
        private readonly resourceGroupRepo: Repository<AzureResourceGroup>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertSubscriptions(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.subscriptionRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            state: (r.properties as any)?.state ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.subscriptionRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async upsertResourceGroups(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.resourceGroupRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.resourceGroupRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listSubscriptions(cloudAccountId: string, organizationId: string): Promise<AzureSubscription[]> {
        await this.validateAccount(cloudAccountId, organizationId);
        return this.subscriptionRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getSubscription(id: string, cloudAccountId: string, organizationId: string): Promise<AzureSubscription> {
        await this.validateAccount(cloudAccountId, organizationId);
        const entity = await this.subscriptionRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async listResourceGroups(cloudAccountId: string, organizationId: string): Promise<AzureResourceGroup[]> {
        await this.validateAccount(cloudAccountId, organizationId);
        return this.resourceGroupRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getResourceGroup(id: string, cloudAccountId: string, organizationId: string): Promise<AzureResourceGroup> {
        await this.validateAccount(cloudAccountId, organizationId);
        const entity = await this.resourceGroupRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
