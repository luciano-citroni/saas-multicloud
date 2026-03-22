import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureKeyVault } from '../../db/entites/azure-key-vault.entity';
import { AzureRecoveryVault } from '../../db/entites/azure-recovery-vault.entity';

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
export class AzureSecurityService {
    constructor(
        @InjectRepository(AzureKeyVault)
        private readonly keyVaultRepo: Repository<AzureKeyVault>,
        @InjectRepository(AzureRecoveryVault)
        private readonly recoveryVaultRepo: Repository<AzureRecoveryVault>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertKeyVaults(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.keyVaultRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            vaultUri: (r.properties as any)?.vaultUri ?? null,
            sku: (r.properties as any)?.sku?.name ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.keyVaultRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listKeyVaults(cloudAccountId: string, orgId: string): Promise<AzureKeyVault[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.keyVaultRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getKeyVault(id: string, cloudAccountId: string, orgId: string): Promise<AzureKeyVault> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.keyVaultRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertRecoveryVaults(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.recoveryVaultRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            sku: (r.properties as any)?.sku?.name ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.recoveryVaultRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listRecoveryVaults(cloudAccountId: string, orgId: string): Promise<AzureRecoveryVault[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.recoveryVaultRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getRecoveryVault(id: string, cloudAccountId: string, orgId: string): Promise<AzureRecoveryVault> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.recoveryVaultRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
