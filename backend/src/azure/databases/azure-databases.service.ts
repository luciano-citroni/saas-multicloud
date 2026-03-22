import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloudService } from '../../cloud/cloud.service';
import { AzureSqlServer } from '../../db/entites/azure-sql-server.entity';
import { AzureSqlDatabase } from '../../db/entites/azure-sql-database.entity';
import { AzurePostgresServer } from '../../db/entites/azure-postgres-server.entity';
import { AzureCosmosDb } from '../../db/entites/azure-cosmos-db.entity';

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
export class AzureDatabasesService {
    constructor(
        @InjectRepository(AzureSqlServer)
        private readonly sqlServerRepo: Repository<AzureSqlServer>,
        @InjectRepository(AzureSqlDatabase)
        private readonly sqlDbRepo: Repository<AzureSqlDatabase>,
        @InjectRepository(AzurePostgresServer)
        private readonly postgresRepo: Repository<AzurePostgresServer>,
        @InjectRepository(AzureCosmosDb)
        private readonly cosmosRepo: Repository<AzureCosmosDb>,
        private readonly cloudService: CloudService,
    ) {}

    private async validateAccount(cloudAccountId: string, organizationId: string): Promise<void> {
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);
        if (!account) throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
    }

    async upsertSqlServers(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.sqlServerRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            fullyQualifiedDomainName: (r.properties as any)?.fullyQualifiedDomainName ?? null,
            administratorLogin: (r.properties as any)?.administratorLogin ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.sqlServerRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listSqlServers(cloudAccountId: string, orgId: string): Promise<AzureSqlServer[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.sqlServerRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getSqlServer(id: string, cloudAccountId: string, orgId: string): Promise<AzureSqlServer> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.sqlServerRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertSqlDatabases(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.sqlDbRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            sku: (r.properties as any)?.currentServiceObjectiveName ?? null,
            status: (r.properties as any)?.status ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.sqlDbRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listSqlDatabases(cloudAccountId: string, orgId: string): Promise<AzureSqlDatabase[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.sqlDbRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getSqlDatabase(id: string, cloudAccountId: string, orgId: string): Promise<AzureSqlDatabase> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.sqlDbRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertPostgresServers(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.postgresRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            administratorLogin: (r.properties as any)?.administratorLogin ?? null,
            version: (r.properties as any)?.version ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.postgresRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listPostgresServers(cloudAccountId: string, orgId: string): Promise<AzurePostgresServer[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.postgresRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getPostgresServer(id: string, cloudAccountId: string, orgId: string): Promise<AzurePostgresServer> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.postgresRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }

    async upsertCosmosDbAccounts(cloudAccountId: string, resources: ArgResource[]): Promise<void> {
        if (!resources.length) return;
        const entities = resources.map(r => this.cosmosRepo.create({
            cloudAccountId,
            azureId: r.id,
            name: r.name,
            location: r.location ?? null,
            resourceGroup: r.resourceGroup ?? null,
            subscriptionId: r.subscriptionId ?? null,
            tags: r.tags ?? null,
            properties: r.properties ?? null,
            databaseAccountOfferType: (r.properties as any)?.databaseAccountOfferType ?? null,
            documentEndpoint: (r.properties as any)?.documentEndpoint ?? null,
            lastSyncedAt: new Date(),
        }));
        for (let i = 0; i < entities.length; i += BATCH) {
            await this.cosmosRepo.upsert(entities.slice(i, i + BATCH), {
                conflictPaths: ['cloudAccountId', 'azureId'],
                skipUpdateIfNoValuesChanged: false,
            });
        }
    }

    async listCosmosDbAccounts(cloudAccountId: string, orgId: string): Promise<AzureCosmosDb[]> {
        await this.validateAccount(cloudAccountId, orgId);
        return this.cosmosRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getCosmosDbAccount(id: string, cloudAccountId: string, orgId: string): Promise<AzureCosmosDb> {
        await this.validateAccount(cloudAccountId, orgId);
        const entity = await this.cosmosRepo.findOne({ where: { id, cloudAccountId } });
        if (!entity) throw new NotFoundException(`Recurso '${id}' não encontrado.`);
        return entity;
    }
}
