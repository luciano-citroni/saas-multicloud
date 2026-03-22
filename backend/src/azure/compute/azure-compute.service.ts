import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureVmss } from '../../db/entites/azure-vmss.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';
import { AzureAksCluster } from '../../db/entites/azure-aks-cluster.entity';

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
export class AzureComputeService {
    constructor(
        @InjectRepository(AzureVirtualMachine)
        private readonly vmRepo: Repository<AzureVirtualMachine>,
        @InjectRepository(AzureVmss)
        private readonly vmssRepo: Repository<AzureVmss>,
        @InjectRepository(AzureDisk)
        private readonly diskRepo: Repository<AzureDisk>,
        @InjectRepository(AzureAksCluster)
        private readonly aksRepo: Repository<AzureAksCluster>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertVirtualMachines(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.vmRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            vmSize: (r.properties as any)?.hardwareProfile?.vmSize ?? null,
            osType: (r.properties as any)?.storageProfile?.osDisk?.osType ?? null,
            provisioningState: (r.properties as any)?.provisioningState ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.vmRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listVirtualMachines(cloudAccountId: string, orgId: string): Promise<AzureVirtualMachine[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.vmRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getVirtualMachine(id: string, cloudAccountId: string, orgId: string): Promise<AzureVirtualMachine> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.vmRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertVmss(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.vmssRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            sku: (r.properties as any)?.sku?.name ?? null,
            provisioningState: (r.properties as any)?.provisioningState ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.vmssRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listVmss(cloudAccountId: string, orgId: string): Promise<AzureVmss[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.vmssRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getVmss(id: string, cloudAccountId: string, orgId: string): Promise<AzureVmss> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.vmssRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertDisks(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.diskRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            diskSizeGb: (r.properties as any)?.diskSizeGB ?? null,
            diskState: (r.properties as any)?.diskState ?? null,
            sku: (r.properties as any)?.sku?.name ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.diskRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listDisks(cloudAccountId: string, orgId: string): Promise<AzureDisk[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.diskRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getDisk(id: string, cloudAccountId: string, orgId: string): Promise<AzureDisk> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.diskRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertAksClusters(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.aksRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            kubernetesVersion: (r.properties as any)?.kubernetesVersion ?? null,
            provisioningState: (r.properties as any)?.provisioningState ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.aksRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listAksClusters(cloudAccountId: string, orgId: string): Promise<AzureAksCluster[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.aksRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getAksCluster(id: string, cloudAccountId: string, orgId: string): Promise<AzureAksCluster> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.aksRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
