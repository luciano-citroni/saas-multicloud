import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpCdnBackendService } from '../../db/entites/gcp-cdn-backend-service.entity';

@Injectable()
export class GcpCdnService {
    private readonly logger = new Logger(GcpCdnService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpCdnBackendService)
        private readonly backendServiceRepo: Repository<GcpCdnBackendService>
    ) {}

    async listFromDatabase(cloudAccountId: string): Promise<GcpCdnBackendService[]> {
        return this.backendServiceRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpCdnBackendService[]> {
        const { client, projectId } = await this.connector.getComputeClient(cloudAccountId, organizationId);

        // Aggregate global + regional backend services
        const results = await (client.backendServices as any).aggregatedList({ project: projectId, maxResults: 500 }).catch((err: unknown) => {
            throw new BadRequestException(
                `Falha ao listar backend services GCP (compute.backendServices.aggregatedList): ${(err as Error)?.message ?? err}`
            );
        });

        const now = new Date();
        const upserted: GcpCdnBackendService[] = [];
        const items: Record<string, { backendServices?: any[] }> = results.data.items ?? {};

        for (const [scopeKey, scopeData] of Object.entries(items)) {
            const regionLabel = extractRegion(scopeKey);
            for (const bs of scopeData.backendServices ?? []) {
                const gcpBackendServiceId = String(bs.id ?? '');
                if (!gcpBackendServiceId) continue;

                const backends = (bs.backends ?? []).map((b: any) => ({
                    group: b.group,
                    balancingMode: b.balancingMode,
                    capacityScaler: b.capacityScaler,
                }));

                let existing = await this.backendServiceRepo.findOne({ where: { cloudAccountId, gcpBackendServiceId } });

                if (existing) {
                    existing.name = bs.name ?? existing.name;
                    existing.region = regionLabel;
                    existing.loadBalancingScheme = bs.loadBalancingScheme ?? null;
                    existing.protocol = bs.protocol ?? null;
                    existing.cdnEnabled = bs.enableCDN ?? false;
                    existing.cacheMode = bs.cdnPolicy?.cacheMode ?? null;
                    existing.defaultTtlSeconds = bs.cdnPolicy?.defaultTtl ?? null;
                    existing.maxTtlSeconds = bs.cdnPolicy?.maxTtl ?? null;
                    existing.connectionDrainingTimeoutSec = bs.connectionDraining?.drainingTimeoutSec ?? null;
                    existing.backends = backends;
                    existing.lastSyncedAt = now;
                } else {
                    existing = this.backendServiceRepo.create({
                        cloudAccountId,
                        gcpBackendServiceId,
                        name: bs.name ?? '',
                        region: regionLabel,
                        loadBalancingScheme: bs.loadBalancingScheme ?? null,
                        protocol: bs.protocol ?? null,
                        cdnEnabled: bs.enableCDN ?? false,
                        cacheMode: bs.cdnPolicy?.cacheMode ?? null,
                        defaultTtlSeconds: bs.cdnPolicy?.defaultTtl ?? null,
                        maxTtlSeconds: bs.cdnPolicy?.maxTtl ?? null,
                        connectionDrainingTimeoutSec: bs.connectionDraining?.drainingTimeoutSec ?? null,
                        backends,
                        lastSyncedAt: now,
                    });
                }

                upserted.push(await this.backendServiceRepo.save(existing));
            }
        }

        return upserted;
    }
}

function extractRegion(scopeKey: string): string {
    // "regions/us-central1" → "us-central1", "global" → "global"
    if (scopeKey.startsWith('regions/')) return scopeKey.replace('regions/', '');
    return 'global';
}
