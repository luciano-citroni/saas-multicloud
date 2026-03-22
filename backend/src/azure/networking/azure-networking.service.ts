import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureVirtualNetwork } from '../../db/entites/azure-virtual-network.entity';
import { AzureNetworkInterface } from '../../db/entites/azure-network-interface.entity';
import { AzurePublicIp } from '../../db/entites/azure-public-ip.entity';
import { AzureNsg } from '../../db/entites/azure-nsg.entity';
import { AzureLoadBalancer } from '../../db/entites/azure-load-balancer.entity';
import { AzureApplicationGateway } from '../../db/entites/azure-application-gateway.entity';

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
export class AzureNetworkingService {
    constructor(
        @InjectRepository(AzureVirtualNetwork)
        private readonly vnetRepo: Repository<AzureVirtualNetwork>,
        @InjectRepository(AzureNetworkInterface)
        private readonly nicRepo: Repository<AzureNetworkInterface>,
        @InjectRepository(AzurePublicIp)
        private readonly publicIpRepo: Repository<AzurePublicIp>,
        @InjectRepository(AzureNsg)
        private readonly nsgRepo: Repository<AzureNsg>,
        @InjectRepository(AzureLoadBalancer)
        private readonly lbRepo: Repository<AzureLoadBalancer>,
        @InjectRepository(AzureApplicationGateway)
        private readonly appGwRepo: Repository<AzureApplicationGateway>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertVirtualNetworks(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.vnetRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            addressPrefixes: (r.properties as any)?.addressSpace?.addressPrefixes ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.vnetRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listVirtualNetworks(cloudAccountId: string, orgId: string): Promise<AzureVirtualNetwork[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.vnetRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getVirtualNetwork(id: string, cloudAccountId: string, orgId: string): Promise<AzureVirtualNetwork> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.vnetRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertNetworkInterfaces(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.nicRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            privateIpAddress: (r.properties as any)?.ipConfigurations?.[0]?.properties?.privateIPAddress ?? null,
            provisioningState: (r.properties as any)?.provisioningState ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.nicRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listNetworkInterfaces(cloudAccountId: string, orgId: string): Promise<AzureNetworkInterface[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.nicRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getNetworkInterface(id: string, cloudAccountId: string, orgId: string): Promise<AzureNetworkInterface> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.nicRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertPublicIps(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.publicIpRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            ipAddress: (r.properties as any)?.ipAddress ?? null,
            allocationMethod: (r.properties as any)?.publicIPAllocationMethod ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.publicIpRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listPublicIps(cloudAccountId: string, orgId: string): Promise<AzurePublicIp[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.publicIpRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getPublicIp(id: string, cloudAccountId: string, orgId: string): Promise<AzurePublicIp> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.publicIpRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertNsgs(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.nsgRepo.create({
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
            await this.nsgRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listNsgs(cloudAccountId: string, orgId: string): Promise<AzureNsg[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.nsgRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getNsg(id: string, cloudAccountId: string, orgId: string): Promise<AzureNsg> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.nsgRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertLoadBalancers(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.lbRepo.create({
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
            await this.lbRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listLoadBalancers(cloudAccountId: string, orgId: string): Promise<AzureLoadBalancer[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.lbRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getLoadBalancer(id: string, cloudAccountId: string, orgId: string): Promise<AzureLoadBalancer> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.lbRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertApplicationGateways(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.appGwRepo.create({
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
            await this.appGwRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listApplicationGateways(cloudAccountId: string, orgId: string): Promise<AzureApplicationGateway[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.appGwRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getApplicationGateway(id: string, cloudAccountId: string, orgId: string): Promise<AzureApplicationGateway> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.appGwRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
