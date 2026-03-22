import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureStorageAccount } from '../../db/entites/azure-storage-account.entity';

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
export class AzureStorageService {
    constructor(
        @InjectRepository(AzureStorageAccount)
        private readonly storageRepo: Repository<AzureStorageAccount>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertStorageAccounts(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.storageRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            sku: (r.properties as any)?.sku?.name ?? null,
            kind: (r.properties as any)?.kind ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.storageRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listStorageAccounts(cloudAccountId: string, orgId: string): Promise<AzureStorageAccount[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.storageRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getStorageAccount(id: string, cloudAccountId: string, orgId: string): Promise<AzureStorageAccount> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.storageRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
