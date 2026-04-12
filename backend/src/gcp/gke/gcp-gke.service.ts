import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpGkeCluster } from '../../db/entites/gcp-gke-cluster.entity';

@Injectable()
export class GcpGkeService {
    private readonly logger = new Logger(GcpGkeService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpGkeCluster)
        private readonly clusterRepo: Repository<GcpGkeCluster>
    ) {}

    async listClustersFromDatabase(cloudAccountId: string): Promise<GcpGkeCluster[]> {
        return this.clusterRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncClustersFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpGkeCluster[]> {
        const { client, projectId } = await this.connector.getContainerClient(cloudAccountId, organizationId);

        // List all clusters across all locations using '-' wildcard
        const response = await (client.projects.locations.clusters as any)
            .list({ parent: `projects/${projectId}/locations/-` })
            .catch((err: unknown) => {
                throw new BadRequestException(`Falha ao listar clusters GKE (container.projects.locations.clusters.list): ${(err as Error)?.message ?? err}`);
            });

        const now = new Date();
        const upserted: GcpGkeCluster[] = [];

        for (const cluster of response.data.clusters ?? []) {
            const name = cluster.name ?? '';
            const location = cluster.location ?? extractLastSegment(cluster.selfLink ?? '');
            const gcpClusterId = `${name}/${location}`;

            if (!name) continue;

            let existing = await this.clusterRepo.findOne({ where: { cloudAccountId, gcpClusterId } });

            const nodeCount = cluster.currentNodeCount ?? null;
            const networkName = extractLastSegment(cluster.network ?? '');

            if (existing) {
                existing.name = name;
                existing.location = location;
                existing.status = cluster.status ?? existing.status;
                existing.nodeCount = nodeCount;
                existing.currentMasterVersion = cluster.currentMasterVersion ?? null;
                existing.currentNodeVersion = cluster.currentNodeVersion ?? null;
                existing.endpoint = cluster.endpoint ?? null;
                existing.networkName = networkName || null;
                existing.subnetwork = cluster.subnetwork ?? null;
                existing.loggingService = cluster.loggingService ?? null;
                existing.monitoringService = cluster.monitoringService ?? null;
                existing.resourceLabels = cluster.resourceLabels ?? null;
                existing.createTime = cluster.createTime ? new Date(cluster.createTime) : null;
                existing.lastSyncedAt = now;
            } else {
                existing = this.clusterRepo.create({
                    cloudAccountId,
                    gcpClusterId,
                    name,
                    location,
                    status: cluster.status ?? 'UNKNOWN',
                    nodeCount,
                    currentMasterVersion: cluster.currentMasterVersion ?? null,
                    currentNodeVersion: cluster.currentNodeVersion ?? null,
                    endpoint: cluster.endpoint ?? null,
                    networkName: networkName || null,
                    subnetwork: cluster.subnetwork ?? null,
                    loggingService: cluster.loggingService ?? null,
                    monitoringService: cluster.monitoringService ?? null,
                    resourceLabels: cluster.resourceLabels ?? null,
                    createTime: cluster.createTime ? new Date(cluster.createTime) : null,
                    lastSyncedAt: now,
                });
            }

            upserted.push(await this.clusterRepo.save(existing));
        }

        return upserted;
    }
}

function extractLastSegment(url: string): string {
    return url.includes('/') ? url.split('/').pop() ?? url : url;
}
