import { Injectable } from '@nestjs/common';
import { GcpAssessmentData } from './gcp-assessment-report.service';

export interface ReactFlowNodeData {
    label: string;
    resourceType: string;
    awsId?: string;
    status?: string;
    details?: Record<string, unknown>;
    group?: {
        vpcId?: string;
        vpcName?: string;
        region?: string;
    };
}

export interface ReactFlowNode {
    id: string;
    type: 'default';
    position: { x: number; y: number };
    data: ReactFlowNodeData;
}

export interface ReactFlowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: 'smoothstep';
    animated?: boolean;
    data?: { relationship: string };
}

export interface ReactFlowGraph {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
}

// region helpers

function regionFromZone(zone: string): string {
    // us-central1-a → us-central1
    const m = zone.match(/^([a-z]+-[a-z]+-\d+)/i);
    return m ? m[1] : zone;
}

@Injectable()
export class GcpAssessmentArchitectureService {
    buildReactFlowGraph(cloudAccountId: string, data: GcpAssessmentData): ReactFlowGraph {
        const nodes: ReactFlowNode[] = [];
        const edges: ReactFlowEdge[] = [];
        const nodeIds = new Set<string>();
        const edgeIds = new Set<string>();
        const typeCounters = new Map<string, number>();

        const columnX: Record<string, number> = {
            vpc: 0,
            subnet: 260,
            firewall: 520,
            gke: 780,
            vm: 1040,
            bucket: 1300,
            sql: 1560,
            sa: 1820,
            cdn: 2080,
            cloudrun: 2340,
            cloudrunjob: 2600,
        };

        const nextPos = (kind: string): { x: number; y: number } => {
            const count = typeCounters.get(kind) ?? 0;
            typeCounters.set(kind, count + 1);
            return { x: columnX[kind] ?? 2080, y: 80 + count * 120 };
        };

        const pushNode = (
            id: string,
            kind: string,
            label: string,
            resourceType: string,
            options?: {
                gcpId?: string;
                status?: string;
                details?: Record<string, unknown>;
                group?: { vpcId?: string; vpcName?: string; region?: string };
            }
        ): void => {
            if (nodeIds.has(id)) return;
            nodeIds.add(id);
            nodes.push({
                id,
                type: 'default',
                position: nextPos(kind),
                data: {
                    label,
                    resourceType,
                    awsId: options?.gcpId,
                    status: options?.status,
                    details: options?.details,
                    group: options?.group,
                },
            });
        };

        const pushEdge = (source: string, target: string, relationship: string, animated = false): void => {
            const id = `edge:${source}->${target}:${relationship}`;
            if (edgeIds.has(id)) return;
            edgeIds.add(id);
            edges.push({ id, source, target, label: relationship, type: 'smoothstep', animated, data: { relationship } });
        };

        // ── VPCs ─────────────────────────────────────────────────────────────
        const vpcNodeIdByName = new Map<string, string>(); // networkName → nodeId

        for (const vpc of data.vpcNetworks) {
            const nodeId = `gcp-vpc:${vpc.id}`;
            vpcNodeIdByName.set(vpc.name, nodeId);
            pushNode(nodeId, 'vpc', vpc.name, 'GCP VPC Network', {
                gcpId: vpc.gcpNetworkId,
                details: { routingMode: vpc.routingMode, autoCreateSubnetworks: vpc.autoCreateSubnetworks },
            });
        }

        // ── Subnets ───────────────────────────────────────────────────────────
        for (const subnet of data.subnetworks) {
            const nodeId = `gcp-subnet:${subnet.id}`;
            pushNode(nodeId, 'subnet', `${subnet.name} (${subnet.region})`, 'GCP Subnetwork', {
                gcpId: subnet.gcpSubnetworkId,
                details: { ipCidrRange: subnet.ipCidrRange, region: subnet.region, privateIpGoogleAccess: subnet.privateIpGoogleAccess },
                group: { vpcName: subnet.networkName ?? undefined },
            });

            const vpcNodeId = subnet.networkName ? vpcNodeIdByName.get(subnet.networkName) : undefined;
            if (vpcNodeId) {
                pushEdge(vpcNodeId, nodeId, 'contains');
            }
        }

        // ── Firewall Rules ────────────────────────────────────────────────────
        for (const fw of data.firewallRules) {
            if (fw.disabled) continue;
            const nodeId = `gcp-fw:${fw.id}`;
            pushNode(nodeId, 'firewall', fw.name, 'GCP Firewall Rule', {
                gcpId: fw.gcpFirewallId,
                details: { direction: fw.direction, priority: fw.priority, sourceRanges: fw.sourceRanges },
                group: { vpcName: fw.networkName ?? undefined },
            });

            const vpcNodeId = fw.networkName ? vpcNodeIdByName.get(fw.networkName) : undefined;
            if (vpcNodeId) {
                pushEdge(vpcNodeId, nodeId, 'secures', false);
            }
        }

        // ── VMs ───────────────────────────────────────────────────────────────
        for (const vm of data.vmInstances) {
            const nodeId = `gcp-vm:${vm.id}`;
            const region = regionFromZone(vm.zone);
            pushNode(nodeId, 'vm', vm.name, 'GCP VM Instance', {
                gcpId: vm.gcpInstanceId,
                status: vm.status,
                details: {
                    zone: vm.zone,
                    machineType: vm.machineType,
                    networkIp: vm.networkIp,
                    externalIp: vm.externalIp,
                    deletionProtection: vm.deletionProtection,
                },
                group: { region },
            });
        }

        // ── GKE Clusters ──────────────────────────────────────────────────────
        for (const gke of data.gkeClusters) {
            const nodeId = `gcp-gke:${gke.id}`;
            pushNode(nodeId, 'gke', gke.name, 'GKE Cluster', {
                gcpId: gke.gcpClusterId,
                status: gke.status,
                details: {
                    location: gke.location,
                    nodeCount: gke.nodeCount,
                    masterVersion: gke.currentMasterVersion,
                    network: gke.networkName,
                },
                group: { vpcName: gke.networkName ?? undefined },
            });

            const vpcNodeId = gke.networkName ? vpcNodeIdByName.get(gke.networkName) : undefined;
            if (vpcNodeId) {
                pushEdge(vpcNodeId, nodeId, 'hosts', true);
            }
        }

        // ── Storage Buckets ───────────────────────────────────────────────────
        for (const bucket of data.storageBuckets) {
            const nodeId = `gcp-bucket:${bucket.id}`;
            pushNode(nodeId, 'bucket', bucket.name, 'GCS Bucket', {
                gcpId: bucket.gcpBucketId,
                details: {
                    location: bucket.location,
                    storageClass: bucket.storageClass,
                    versioningEnabled: bucket.versioningEnabled,
                    publicAccessPrevention: bucket.publicAccessPrevention,
                    uniformBucketLevelAccess: bucket.uniformBucketLevelAccess,
                },
            });
        }

        // ── SQL Instances ─────────────────────────────────────────────────────
        for (const sql of data.sqlInstances) {
            const nodeId = `gcp-sql:${sql.id}`;
            pushNode(nodeId, 'sql', sql.name, 'Cloud SQL', {
                gcpId: sql.gcpInstanceId,
                status: sql.state,
                details: {
                    databaseVersion: sql.databaseVersion,
                    region: sql.region,
                    tier: sql.tier,
                    backupEnabled: sql.backupEnabled,
                    highAvailability: sql.availabilityType === 'REGIONAL',
                },
            });
        }

        // ── Service Accounts ─────────────────────────────────────────────────
        for (const sa of data.serviceAccounts) {
            if (sa.disabled) continue;
            const nodeId = `gcp-sa:${sa.id}`;
            pushNode(nodeId, 'sa', sa.displayName ?? sa.email, 'Service Account', {
                gcpId: sa.gcpUniqueId ?? undefined,
                details: { email: sa.email, description: sa.description },
            });

            // VM → SA edges
            for (const vm of data.vmInstances) {
                if (vm.serviceAccountEmail && vm.serviceAccountEmail === sa.email) {
                    pushEdge(`gcp-vm:${vm.id}`, nodeId, 'uses', true);
                }
            }
        }
        // ── CDN Backend Services ──────────────────────────────────────────────
        for (const cdn of data.cdnBackendServices) {
            const nodeId = `gcp-cdn:${cdn.id}`;
            pushNode(nodeId, 'cdn', cdn.name, 'CDN Backend Service', {
                gcpId: cdn.gcpBackendServiceId,
                details: {
                    region: cdn.region,
                    protocol: cdn.protocol,
                    loadBalancingScheme: cdn.loadBalancingScheme,
                    cdnEnabled: cdn.cdnEnabled,
                    cacheMode: cdn.cacheMode,
                },
                group: { region: cdn.region === 'global' ? undefined : cdn.region },
            });
        }

        // ── Cloud Run Services ────────────────────────────────────────────────
        for (const cr of data.cloudRunServices) {
            const nodeId = `gcp-cloudrun:${cr.id}`;
            pushNode(nodeId, 'cloudrun', cr.name, 'Cloud Run Service', {
                gcpId: cr.gcpServiceName,
                status: cr.condition ?? undefined,
                details: {
                    region: cr.region,
                    uri: cr.uri,
                    allowsUnauthenticated: cr.allowsUnauthenticated,
                    containerImage: cr.containerImage,
                    maxInstanceCount: cr.maxInstanceCount,
                    minInstanceCount: cr.minInstanceCount,
                    cpuLimit: cr.cpuLimit,
                    memoryLimit: cr.memoryLimit,
                    vpcConnector: cr.vpcConnector,
                },
                group: { region: cr.region },
            });

            // Cloud Run → VPC edge (via connector)
            if (cr.vpcConnector) {
                // Best-effort: match by any VPC network name substring in connector path
                for (const [networkName, vpcNodeId] of vpcNodeIdByName.entries()) {
                    if (cr.vpcConnector.includes(networkName)) {
                        pushEdge(nodeId, vpcNodeId, 'connects via VPC', true);
                        break;
                    }
                }
            }
        }

        // ── Cloud Run Jobs ────────────────────────────────────────────────────
        for (const job of data.cloudRunJobs) {
            const nodeId = `gcp-cloudrun-job:${job.id}`;
            pushNode(nodeId, 'cloudrunjob', job.name, 'Cloud Run Job', {
                gcpId: job.gcpJobName,
                status: job.condition ?? undefined,
                details: {
                    region: job.region,
                    containerImage: job.containerImage,
                    taskCount: job.taskCount,
                    maxRetries: job.maxRetries,
                    executionCount: job.executionCount,
                    cpuLimit: job.cpuLimit,
                    memoryLimit: job.memoryLimit,
                    latestCreatedExecution: job.latestCreatedExecution,
                },
                group: { region: job.region },
            });
        }

        return { nodes, edges };
    }
}
