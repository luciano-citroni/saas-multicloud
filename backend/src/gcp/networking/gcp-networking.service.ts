import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpVpcNetwork } from '../../db/entites/gcp-vpc-network.entity';
import { GcpSubnetwork } from '../../db/entites/gcp-subnetwork.entity';
import { GcpFirewallRule } from '../../db/entites/gcp-firewall-rule.entity';

@Injectable()
export class GcpNetworkingService {
    private readonly logger = new Logger(GcpNetworkingService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpVpcNetwork)
        private readonly networkRepo: Repository<GcpVpcNetwork>,

        @InjectRepository(GcpSubnetwork)
        private readonly subnetRepo: Repository<GcpSubnetwork>,

        @InjectRepository(GcpFirewallRule)
        private readonly firewallRepo: Repository<GcpFirewallRule>
    ) {}

    // ── VPC Networks ──────────────────────────────────────────────────────────

    async listNetworksFromDatabase(cloudAccountId: string): Promise<GcpVpcNetwork[]> {
        return this.networkRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncNetworksFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpVpcNetwork[]> {
        const { client, projectId } = await this.connector.getComputeClient(cloudAccountId, organizationId);

        const response = await client.networks.list({ project: projectId, maxResults: 500 }).catch((err: unknown) => {
            throw new BadRequestException(`Falha ao listar redes GCP (compute.networks.list): ${(err as Error)?.message ?? err}`);
        });

        const now = new Date();
        const upserted: GcpVpcNetwork[] = [];

        for (const network of response.data.items ?? []) {
            const gcpNetworkId = String(network.id ?? '');
            if (!gcpNetworkId) continue;

            let existing = await this.networkRepo.findOne({ where: { cloudAccountId, gcpNetworkId } });

            const routingMode = (network.routingConfig as any)?.routingMode ?? null;

            if (existing) {
                existing.name = network.name ?? existing.name;
                existing.description = network.description ?? null;
                existing.routingMode = routingMode;
                existing.autoCreateSubnetworks = network.autoCreateSubnetworks ?? false;
                existing.subnetworkUrls = (network.subnetworks as string[]) ?? null;
                existing.creationTimestamp = network.creationTimestamp ? new Date(network.creationTimestamp) : null;
                existing.lastSyncedAt = now;
            } else {
                existing = this.networkRepo.create({
                    cloudAccountId,
                    gcpNetworkId,
                    name: network.name ?? '',
                    description: network.description ?? null,
                    routingMode,
                    autoCreateSubnetworks: network.autoCreateSubnetworks ?? false,
                    subnetworkUrls: (network.subnetworks as string[]) ?? null,
                    creationTimestamp: network.creationTimestamp ? new Date(network.creationTimestamp) : null,
                    lastSyncedAt: now,
                });
            }

            upserted.push(await this.networkRepo.save(existing));
        }

        return upserted;
    }

    // ── Subnetworks ───────────────────────────────────────────────────────────

    async listSubnetworksFromDatabase(cloudAccountId: string): Promise<GcpSubnetwork[]> {
        return this.subnetRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncSubnetworksFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpSubnetwork[]> {
        const { client, projectId } = await this.connector.getComputeClient(cloudAccountId, organizationId);

        const response = await client.subnetworks.aggregatedList({ project: projectId, maxResults: 500 }).catch((err: unknown) => {
            throw new BadRequestException(`Falha ao listar subnetworks GCP (compute.subnetworks.aggregatedList): ${(err as Error)?.message ?? err}`);
        });

        const now = new Date();
        const upserted: GcpSubnetwork[] = [];

        for (const [, regionData] of Object.entries(response.data.items ?? {})) {
            for (const subnet of (regionData as any).subnetworks ?? []) {
                const gcpSubnetworkId = String(subnet.id ?? '');
                if (!gcpSubnetworkId) continue;

                const regionName = extractLastSegment(subnet.region ?? '');
                const networkName = extractLastSegment(subnet.network ?? '');

                let existing = await this.subnetRepo.findOne({ where: { cloudAccountId, gcpSubnetworkId } });

                if (existing) {
                    existing.name = subnet.name ?? existing.name;
                    existing.region = regionName;
                    existing.ipCidrRange = subnet.ipCidrRange ?? existing.ipCidrRange;
                    existing.networkName = networkName || null;
                    existing.privateIpGoogleAccess = subnet.privateIpGoogleAccess ?? false;
                    existing.purpose = subnet.purpose ?? null;
                    existing.creationTimestamp = subnet.creationTimestamp ? new Date(subnet.creationTimestamp) : null;
                    existing.lastSyncedAt = now;
                } else {
                    existing = this.subnetRepo.create({
                        cloudAccountId,
                        gcpSubnetworkId,
                        name: subnet.name ?? '',
                        region: regionName,
                        ipCidrRange: subnet.ipCidrRange ?? '',
                        networkName: networkName || null,
                        privateIpGoogleAccess: subnet.privateIpGoogleAccess ?? false,
                        purpose: subnet.purpose ?? null,
                        creationTimestamp: subnet.creationTimestamp ? new Date(subnet.creationTimestamp) : null,
                        lastSyncedAt: now,
                    });
                }

                upserted.push(await this.subnetRepo.save(existing));
            }
        }

        return upserted;
    }

    // ── Firewall Rules ────────────────────────────────────────────────────────

    async listFirewallRulesFromDatabase(cloudAccountId: string): Promise<GcpFirewallRule[]> {
        return this.firewallRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncFirewallRulesFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpFirewallRule[]> {
        const { client, projectId } = await this.connector.getComputeClient(cloudAccountId, organizationId);

        const response = await client.firewalls.list({ project: projectId, maxResults: 500 }).catch((err: unknown) => {
            throw new BadRequestException(`Falha ao listar regras de firewall GCP (compute.firewalls.list): ${(err as Error)?.message ?? err}`);
        });

        const now = new Date();
        const upserted: GcpFirewallRule[] = [];

        for (const fw of response.data.items ?? []) {
            const gcpFirewallId = String(fw.id ?? '');
            if (!gcpFirewallId) continue;

            const networkName = extractLastSegment(fw.network ?? '');

            let existing = await this.firewallRepo.findOne({ where: { cloudAccountId, gcpFirewallId } });

            if (existing) {
                existing.name = fw.name ?? existing.name;
                existing.description = fw.description ?? null;
                existing.networkName = networkName || null;
                existing.direction = fw.direction ?? existing.direction;
                existing.priority = fw.priority ?? 1000;
                existing.allowed = (fw.allowed as any) ?? null;
                existing.denied = (fw.denied as any) ?? null;
                existing.sourceRanges = (fw.sourceRanges as string[]) ?? null;
                existing.destinationRanges = (fw.destinationRanges as string[]) ?? null;
                existing.targetTags = (fw.targetTags as string[]) ?? null;
                existing.disabled = fw.disabled ?? false;
                existing.creationTimestamp = fw.creationTimestamp ? new Date(fw.creationTimestamp) : null;
                existing.lastSyncedAt = now;
            } else {
                existing = this.firewallRepo.create({
                    cloudAccountId,
                    gcpFirewallId,
                    name: fw.name ?? '',
                    description: fw.description ?? null,
                    networkName: networkName || null,
                    direction: fw.direction ?? 'INGRESS',
                    priority: fw.priority ?? 1000,
                    allowed: (fw.allowed as any) ?? null,
                    denied: (fw.denied as any) ?? null,
                    sourceRanges: (fw.sourceRanges as string[]) ?? null,
                    destinationRanges: (fw.destinationRanges as string[]) ?? null,
                    targetTags: (fw.targetTags as string[]) ?? null,
                    disabled: fw.disabled ?? false,
                    creationTimestamp: fw.creationTimestamp ? new Date(fw.creationTimestamp) : null,
                    lastSyncedAt: now,
                });
            }

            upserted.push(await this.firewallRepo.save(existing));
        }

        return upserted;
    }
}

function extractLastSegment(url: string): string {
    return url.includes('/') ? url.split('/').pop() ?? url : url;
}
