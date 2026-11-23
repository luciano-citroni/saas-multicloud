import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CloudAccount, CloudProvider } from '../db/entites/cloud-account.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import { buildPaginationMeta, normalizePagination, type PaginatedResult } from '../common/pagination/paginate';
import { AwsAssessmentReportService } from '../aws/assessment/aws-assessment-report.service';
import { AzureAssessmentReportService } from '../azure/assessment/azure-assessment-report.service';
import { GcpAssessmentReportService } from '../gcp/assessment/gcp-assessment-report.service';

import type { InventoryOverviewQueryDto, InventoryResourcesQueryDto } from './dto';
import {
    buildMonthlySeries,
    flattenAwsInventory,
    flattenAzureInventory,
    flattenGcpInventory,
    resolvePeriodStart,
    startOfCurrentMonth,
    type InventoryPeriod,
    type InventoryProvider,
    type InventoryResource,
} from './inventory-mapper';

export type InventoryOverviewResult = {
    totalResources: number;
    newThisMonth: number;
    byType: Record<string, number>;
    regions: string[];
    tags: string[];
    resourceTypes: string[];
    monthlyNew: Array<{ month: string; count: number }>;
    provider: InventoryProvider;
    cloudAccountId: string;
    cloudAccountAlias: string;
};

@Injectable()
export class CloudInventoryService {
    private readonly logger = new Logger(CloudInventoryService.name);

    constructor(
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,
        private readonly awsReportService: AwsAssessmentReportService,
        private readonly azureReportService: AzureAssessmentReportService,
        private readonly gcpReportService: GcpAssessmentReportService,
    ) {}

    async getOverview(
        cloudAccountId: string,
        organizationId: string,
        query: InventoryOverviewQueryDto,
    ): Promise<InventoryOverviewResult> {
        const account = await this.requireCloudAccount(cloudAccountId, organizationId);
        const provider = this.normalizeProvider(account.provider);
        const resources = await this.loadResources(cloudAccountId, provider);
        const period = (query.period ?? 'all') as InventoryPeriod;
        const monthStart = startOfCurrentMonth();

        const byType: Record<string, number> = {};
        const regionSet = new Set<string>();
        const tagSet = new Set<string>();
        let newThisMonth = 0;

        for (const resource of resources) {
            byType[resource.resourceType] = (byType[resource.resourceType] ?? 0) + 1;
            if (resource.region) regionSet.add(resource.region);
            for (const [key, value] of Object.entries(resource.tags ?? {})) {
                tagSet.add(`${key}:${value}`);
            }
            if (new Date(resource.createdAt) >= monthStart) newThisMonth += 1;
        }

        return {
            totalResources: resources.length,
            newThisMonth,
            byType,
            regions: Array.from(regionSet).sort((a, b) => a.localeCompare(b)),
            tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
            resourceTypes: Object.keys(byType).sort((a, b) => a.localeCompare(b)),
            monthlyNew: buildMonthlySeries(resources, period),
            provider,
            cloudAccountId: account.id,
            cloudAccountAlias: account.alias,
        };
    }

    async listResources(
        cloudAccountId: string,
        organizationId: string,
        query: InventoryResourcesQueryDto,
    ): Promise<
        PaginatedResult<InventoryResource> & {
            facets: { regions: string[]; tags: string[] };
        }
    > {
        const account = await this.requireCloudAccount(cloudAccountId, organizationId);
        const provider = this.normalizeProvider(account.provider);
        const resources = await this.loadResources(cloudAccountId, provider);

        // Facets are scoped to the selected resource type (before name/region/tag filters).
        const typeScoped = query.resourceType?.trim()
            ? resources.filter((resource) => resource.resourceType === query.resourceType?.trim())
            : resources;
        const facets = this.buildFacets(typeScoped);

        const filtered = this.applyFilters(resources, query);
        const { page, limit } = normalizePagination({ page: query.page, limit: query.limit });
        const pagination = buildPaginationMeta(filtered.length, page, limit);
        const offset = (pagination.page - 1) * limit;
        const items = filtered.slice(offset, offset + limit);

        return { items, pagination, facets };
    }

    private buildFacets(resources: InventoryResource[]): { regions: string[]; tags: string[] } {
        const regions = new Set<string>();
        const tags = new Set<string>();
        for (const resource of resources) {
            if (resource.region) regions.add(resource.region);
            for (const [key, value] of Object.entries(resource.tags ?? {})) {
                tags.add(`${key}:${value}`);
            }
        }
        return {
            regions: Array.from(regions).sort((a, b) => a.localeCompare(b)),
            tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
        };
    }

    private matchesTagFilter(resource: InventoryResource, tagFilter: string): boolean {
        const normalized = tagFilter.trim().toLowerCase();
        if (!normalized) return true;
        const entries = Object.entries(resource.tags ?? {});
        if (entries.length === 0) return false;

        const colonIndex = normalized.indexOf(':');
        if (colonIndex > 0) {
            const key = normalized.slice(0, colonIndex).trim();
            const value = normalized.slice(colonIndex + 1).trim();
            return entries.some(([entryKey, entryValue]) => {
                const keyMatch = entryKey.toLowerCase() === key;
                if (!keyMatch) return false;
                if (!value) return true;
                return entryValue.toLowerCase() === value || entryValue.toLowerCase().includes(value);
            });
        }

        return entries.some(([entryKey, entryValue]) => {
            const pair = `${entryKey}:${entryValue}`.toLowerCase();
            return (
                entryKey.toLowerCase() === normalized ||
                entryKey.toLowerCase().includes(normalized) ||
                entryValue.toLowerCase().includes(normalized) ||
                pair.includes(normalized)
            );
        });
    }

    private applyFilters(resources: InventoryResource[], query: InventoryResourcesQueryDto): InventoryResource[] {
        const period = (query.period ?? 'all') as InventoryPeriod;
        const periodStart = resolvePeriodStart(period);
        const q = query.q?.trim().toLowerCase() ?? '';
        const resourceType = query.resourceType?.trim() ?? '';
        const region = query.region?.trim() ?? '';
        const tag = query.tag?.trim() ?? '';

        return resources
            .filter((resource) => {
                if (periodStart && new Date(resource.createdAt) < periodStart) return false;
                if (resourceType && resource.resourceType !== resourceType) return false;
                if (region && resource.region !== region) return false;
                if (tag && !this.matchesTagFilter(resource, tag)) return false;
                if (q && !resource.name.toLowerCase().includes(q)) return false;
                return true;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    private async loadResources(cloudAccountId: string, provider: InventoryProvider): Promise<InventoryResource[]> {
        if (provider === 'aws') {
            const data = await this.awsReportService.collectAllData(cloudAccountId);
            return flattenAwsInventory(data as unknown as Record<string, unknown[]>);
        }
        if (provider === 'azure') {
            const data = await this.azureReportService.collectAllData(cloudAccountId);
            return flattenAzureInventory(data as unknown as Record<string, unknown[]>);
        }
        const data = await this.gcpReportService.collectAllData(cloudAccountId);
        return flattenGcpInventory(data as unknown as Record<string, unknown[]>);
    }

    private normalizeProvider(provider: CloudProvider | string): InventoryProvider {
        const value = String(provider).toLowerCase();
        if (value === CloudProvider.AWS || value === 'aws') return 'aws';
        if (value === CloudProvider.AZURE || value === 'azure') return 'azure';
        if (value === CloudProvider.GCP || value === 'gcp') return 'gcp';
        this.logger.warn(`Unsupported inventory provider "${provider}"`);
        throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.INVALID_PROVIDER);
    }

    private async requireCloudAccount(cloudAccountId: string, organizationId: string): Promise<CloudAccount> {
        const cloudAccount = await this.cloudAccountRepository.findOne({
            where: { id: cloudAccountId, tenantId: organizationId },
        });

        if (!cloudAccount) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        return cloudAccount;
    }
}
