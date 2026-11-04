import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';
import {
    buildPaginationMeta,
    normalizePagination,
    type PaginatedResult,
    type PaginationInput,
} from '../../common/pagination/paginate';
import { FinopsResourceChangeService } from '../../finops/services/finops-resource-change.service';

@Injectable()
export class GcpComputeService {
    private readonly logger = new Logger(GcpComputeService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpVmInstance)
        private readonly vmRepo: Repository<GcpVmInstance>,

        private readonly resourceChangeService: FinopsResourceChangeService,
    ) {}

    async listInstancesFromDatabase(
        cloudAccountId: string,
        pagination: PaginationInput = {}
    ): Promise<PaginatedResult<GcpVmInstance>> {
        const { page, limit } = normalizePagination(pagination);
        const [items, totalItems] = await this.vmRepo.findAndCount({
            where: { cloudAccountId },
            order: { name: 'ASC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return { items, pagination: buildPaginationMeta(totalItems, page, limit) };
    }

    async syncInstancesFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpVmInstance[]> {
        const { client, projectId } = await this.connector.getComputeClient(cloudAccountId, organizationId);

        const response = await client.instances
            .aggregatedList({ project: projectId, maxResults: 500 })
            .catch((err: unknown) => {
                throw new BadRequestException(
                    `Falha ao listar instâncias GCP (compute.instances.list): ${(err as Error)?.message ?? err}`
                );
            });

        const items = response.data.items ?? {};
        const now = new Date();
        const upserted: GcpVmInstance[] = [];

        for (const [, zoneData] of Object.entries(items)) {
            for (const instance of (zoneData as any).instances ?? []) {
                const gcpInstanceId = String(instance.id ?? '');
                if (!gcpInstanceId) continue;

                const zoneName = extractLastSegment(instance.zone ?? '');
                const machineType = extractLastSegment(instance.machineType ?? '');
                const networkIp = instance.networkInterfaces?.[0]?.networkIP ?? null;
                const externalIp = instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP ?? null;
                const networkInterface = instance.networkInterfaces?.[0]?.name ?? null;
                const serviceAccountEmail = instance.serviceAccounts?.[0]?.email ?? null;

                let existing = await this.vmRepo.findOne({ where: { cloudAccountId, gcpInstanceId } });

                if (existing) {
                    const nextStatus = instance.status ?? existing.status;
                    const changes: Array<{ field: string; previousValue: string; newValue: string }> = [];
                    if (existing.machineType !== machineType) {
                        changes.push({
                            field: 'machineType',
                            previousValue: existing.machineType,
                            newValue: machineType,
                        });
                    }
                    if (existing.status !== nextStatus) {
                        changes.push({
                            field: 'status',
                            previousValue: existing.status,
                            newValue: nextStatus,
                        });
                    }
                    if (changes.length) {
                        await this.resourceChangeService.recordFieldChanges({
                            cloudAccountId,
                            organizationId,
                            cloudProvider: 'gcp',
                            resourceType: 'gcp_vm',
                            resourceId: gcpInstanceId,
                            changes,
                            detectedAt: now,
                        });
                    }

                    existing.name = instance.name ?? existing.name;
                    existing.zone = zoneName;
                    existing.machineType = machineType;
                    existing.status = nextStatus;
                    existing.networkIp = networkIp;
                    existing.externalIp = externalIp;
                    existing.networkInterface = networkInterface;
                    existing.deletionProtection = instance.deletionProtection ?? false;
                    existing.canIpForward = instance.canIpForward ?? false;
                    existing.serviceAccountEmail = serviceAccountEmail;
                    existing.labels = instance.labels ?? null;
                    existing.creationTimestamp = instance.creationTimestamp ? new Date(instance.creationTimestamp) : null;
                    existing.lastSyncedAt = now;
                } else {
                    existing = this.vmRepo.create({
                        cloudAccountId,
                        gcpInstanceId,
                        name: instance.name ?? '',
                        zone: zoneName,
                        machineType,
                        status: instance.status ?? 'UNKNOWN',
                        networkIp,
                        externalIp,
                        networkInterface,
                        deletionProtection: instance.deletionProtection ?? false,
                        canIpForward: instance.canIpForward ?? false,
                        serviceAccountEmail,
                        labels: instance.labels ?? null,
                        creationTimestamp: instance.creationTimestamp ? new Date(instance.creationTimestamp) : null,
                        lastSyncedAt: now,
                    });
                }

                upserted.push(await this.vmRepo.save(existing));
            }
        }

        return upserted;
    }
}

function extractLastSegment(url: string): string {
    return url.includes('/') ? url.split('/').pop() ?? url : url;
}
