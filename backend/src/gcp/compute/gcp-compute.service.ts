import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';

@Injectable()
export class GcpComputeService {
    private readonly logger = new Logger(GcpComputeService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpVmInstance)
        private readonly vmRepo: Repository<GcpVmInstance>
    ) {}

    async listInstancesFromDatabase(cloudAccountId: string): Promise<GcpVmInstance[]> {
        return this.vmRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
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
                    existing.name = instance.name ?? existing.name;
                    existing.zone = zoneName;
                    existing.machineType = machineType;
                    existing.status = instance.status ?? existing.status;
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
