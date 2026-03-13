import { Injectable } from '@nestjs/common';
import { AssessmentData } from './aws-assessment-report.service';

// ─── Tipos do modelo de arquitetura ───────────────────────────────────────────

export interface ArchitectureResource {
    id: string;
    type: string;
    name: string;
    awsId?: string;
    region?: string;
    status?: string;
    details?: Record<string, unknown>;
}

export interface ArchitectureSubnet {
    id: string;
    awsSubnetId: string;
    name: string;
    cidrBlock: string;
    availabilityZone: string;
    type: 'public' | 'private' | 'unknown';
    resources: ArchitectureResource[];
}

export interface ArchitectureVpc {
    id: string;
    awsVpcId: string;
    name: string;
    cidrBlock: string;
    subnets: ArchitectureSubnet[];
    securityGroups: ArchitectureResource[];
    routeTables: ArchitectureResource[];
    loadBalancers: ArchitectureResource[];
    databases: ArchitectureResource[];
    containers: ArchitectureResource[];
    serverless: ArchitectureResource[];
    caches: ArchitectureResource[];
}

export interface ArchitectureModel {
    cloudAccountId: string;
    generatedAt: string;
    vpcs: ArchitectureVpc[];
    globalResources: {
        s3Buckets: ArchitectureResource[];
        cloudFrontDistributions: ArchitectureResource[];
        route53HostedZones: ArchitectureResource[];
        iamRoles: ArchitectureResource[];
        cloudTrailTrails: ArchitectureResource[];
        cloudWatchAlarms: ArchitectureResource[];
        guardDutyDetectors: ArchitectureResource[];
        kmsKeys: ArchitectureResource[];
        secretsManagerSecrets: ArchitectureResource[];
        ecrRepositories: ArchitectureResource[];
        dynamoDbTables: ArchitectureResource[];
        sqsQueues: ArchitectureResource[];
        snsTopics: ArchitectureResource[];
        wafWebAcls: ArchitectureResource[];
        apiGateways: ArchitectureResource[];
    };
}

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
    position: {
        x: number;
        y: number;
    };
    data: ReactFlowNodeData;
}

export interface ReactFlowEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: 'smoothstep';
    animated?: boolean;
    data?: {
        relationship: string;
    };
}

export interface ReactFlowGraph {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AwsAssessmentArchitectureService {
    buildArchitectureModel(cloudAccountId: string, data: AssessmentData): ArchitectureModel {
        const vpcMap = new Map<string, ArchitectureVpc>();
        const loadBalancerVpcMap = new Map<string, string>();

        const buildVpc = (id: string, awsVpcId: string, name: string, cidrBlock: string): ArchitectureVpc => ({
            id,
            awsVpcId,
            name,
            cidrBlock,
            subnets: [],
            securityGroups: [],
            routeTables: [],
            loadBalancers: [],
            databases: [],
            containers: [],
            serverless: [],
            caches: [],
        });

        let unassignedVpc: ArchitectureVpc | null = null;
        const getOrCreateUnassignedVpc = (): ArchitectureVpc => {
            if (unassignedVpc) {
                return unassignedVpc;
            }

            const id = `${cloudAccountId}-unassigned`;
            unassignedVpc = buildVpc(id, 'unassigned', 'Unassigned Resources', 'n/a');
            vpcMap.set(id, unassignedVpc);
            return unassignedVpc;
        };

        const getVpcOrUnassigned = (vpcId?: string | null): ArchitectureVpc => {
            if (!vpcId) {
                return getOrCreateUnassignedVpc();
            }

            return vpcMap.get(vpcId) ?? getOrCreateUnassignedVpc();
        };

        for (const vpc of data.vpcs) {
            vpcMap.set(vpc.id, buildVpc(vpc.id, vpc.awsVpcId, vpc.tags?.['Name'] ?? vpc.awsVpcId, vpc.cidrBlock));
        }

        for (const subnet of data.subnets) {
            const vpc = getVpcOrUnassigned(subnet.vpcId);
            const subnetType: 'public' | 'private' | 'unknown' =
                subnet.subnetType === 'public'
                    ? 'public'
                    : subnet.subnetType === 'private_with_nat' || subnet.subnetType === 'private_isolated'
                      ? 'private'
                      : 'unknown';

            const subnetResource: ArchitectureSubnet = {
                id: subnet.id,
                awsSubnetId: subnet.awsSubnetId,
                name: subnet.tags?.['Name'] ?? subnet.awsSubnetId,
                cidrBlock: subnet.cidrBlock,
                availabilityZone: subnet.availabilityZone,
                type: subnetType,
                resources: [],
            };

            const subnetEc2 = data.ec2Instances.filter((ec2) => ec2.awsSubnetId === subnet.awsSubnetId);
            subnetResource.resources.push(
                ...subnetEc2.map(
                    (ec2) =>
                        ({
                            id: ec2.id,
                            type: 'EC2 Instance',
                            name: ec2.tags?.['Name'] ?? ec2.awsInstanceId,
                            awsId: ec2.awsInstanceId,
                            status: ec2.state,
                            details: {
                                instanceType: ec2.instanceType,
                                privateIp: ec2.privateIpAddress,
                                publicIp: ec2.publicIpAddress,
                                availabilityZone: ec2.availabilityZone,
                            },
                        }) as ArchitectureResource
                )
            );

            vpc.subnets.push(subnetResource);
        }

        for (const sg of data.securityGroups) {
            const vpc = getVpcOrUnassigned(sg.vpcId);
            vpc.securityGroups.push({ id: sg.id, type: 'Security Group', name: sg.name, awsId: sg.awsSecurityGroupId });
        }

        for (const rt of data.routeTables) {
            const vpc = getVpcOrUnassigned(rt.vpcId);
            vpc.routeTables.push({ id: rt.id, type: 'Route Table', name: rt.tags?.['Name'] ?? rt.awsRouteTableId, awsId: rt.awsRouteTableId });
        }

        for (const lb of data.loadBalancers) {
            const vpc = getVpcOrUnassigned(lb.vpcId);
            if (lb.vpcId) {
                loadBalancerVpcMap.set(lb.id, lb.vpcId);
            }
            vpc.loadBalancers.push({
                id: lb.id,
                type: `Load Balancer (${lb.type})`,
                name: lb.name,
                awsId: lb.awsLoadBalancerArn,
                status: lb.state,
                details: { scheme: lb.scheme, dnsName: lb.dnsName },
            });
        }

        for (const listener of data.loadBalancerListeners) {
            const lbVpcId = loadBalancerVpcMap.get(listener.loadBalancerId);
            const vpc = lbVpcId ? vpcMap.get(lbVpcId) ?? getOrCreateUnassignedVpc() : getOrCreateUnassignedVpc();

            vpc.loadBalancers.push({
                id: listener.id,
                type: 'Load Balancer Listener',
                name: `${listener.protocol}:${listener.port}`,
                awsId: listener.awsListenerArn,
                details: { protocol: listener.protocol, port: listener.port, loadBalancerId: listener.loadBalancerId },
            });
        }

        for (const rds of data.rdsInstances) {
            const vpc = getVpcOrUnassigned(rds.vpcId);
            vpc.databases.push({
                id: rds.id,
                type: 'RDS Instance',
                name: rds.awsDbInstanceIdentifier,
                awsId: rds.dbInstanceArn ?? undefined,
                status: rds.status,
                details: { engine: rds.engine, engineVersion: rds.engineVersion, instanceClass: rds.dbInstanceClass },
            });
        }

        for (const cluster of data.ecsClusters) {
            getOrCreateUnassignedVpc().containers.push({
                id: cluster.id,
                type: 'ECS Cluster',
                name: cluster.clusterName,
                awsId: cluster.clusterArn,
                status: cluster.status,
                details: { runningTasksCount: cluster.runningTasksCount, activeServicesCount: cluster.activeServicesCount },
            });
        }

        const taskDefinitionIdsInUse = new Set(data.ecsServices.map((service) => service.taskDefinitionId));
        for (const taskDef of data.ecsTaskDefinitions) {
            if (!taskDefinitionIdsInUse.has(taskDef.id)) {
                continue;
            }

            getOrCreateUnassignedVpc().containers.push({
                id: taskDef.id,
                type: 'ECS Task Definition',
                name: `${taskDef.family}:${taskDef.revision}`,
                awsId: taskDef.taskDefinitionArn,
                status: taskDef.status,
                details: { networkMode: taskDef.networkMode, cpu: taskDef.cpu, memory: taskDef.memory },
            });
        }

        for (const service of data.ecsServices) {
            getOrCreateUnassignedVpc().containers.push({
                id: service.id,
                type: 'ECS Service',
                name: service.serviceName,
                awsId: service.serviceArn,
                status: service.status,
                details: {
                    launchType: service.launchType,
                    desiredCount: service.desiredCount,
                    runningCount: service.runningCount,
                },
            });
        }

        for (const eks of data.eksClusters) {
            getVpcOrUnassigned(eks.vpcId).containers.push({
                id: eks.id,
                type: 'EKS Cluster',
                name: eks.clusterName,
                awsId: eks.clusterArn,
                status: eks.status,
                details: { version: eks.version, endpoint: eks.endpoint },
            });
        }

        for (const fn of data.lambdaFunctions) {
            getVpcOrUnassigned(fn.vpcId).serverless.push({
                id: fn.id,
                type: 'Lambda Function',
                name: fn.functionName,
                awsId: fn.functionArn,
                status: fn.state ?? undefined,
                details: { runtime: fn.runtime, memorySize: fn.memorySize },
            });
        }

        for (const cache of data.elastiCacheClusters) {
            getVpcOrUnassigned(cache.vpcId).caches.push({
                id: cache.id,
                type: 'ElastiCache Cluster',
                name: cache.cacheClusterId,
                awsId: cache.clusterArn ?? undefined,
                status: cache.cacheClusterStatus ?? undefined,
                details: { engine: cache.engine, nodeType: cache.cacheNodeType },
            });
        }

        return {
            cloudAccountId,
            generatedAt: new Date().toISOString(),
            vpcs: Array.from(vpcMap.values()),
            globalResources: {
                s3Buckets: data.s3Buckets.map(
                    (b) => ({ id: b.id, type: 'S3 Bucket', name: b.bucketName, region: b.region, details: { region: b.region } }) as ArchitectureResource
                ),
                cloudFrontDistributions: data.cloudFrontDistributions.map(
                    (cf) =>
                        ({
                            id: cf.id,
                            type: 'CloudFront Distribution',
                            name: cf.domainName ?? cf.distributionId,
                            awsId: cf.distributionId,
                            status: cf.status,
                        }) as ArchitectureResource
                ),
                route53HostedZones: data.route53HostedZones.map(
                    (hz) => ({ id: hz.id, type: 'Route53 Hosted Zone', name: hz.name, awsId: hz.awsHostedZoneId }) as ArchitectureResource
                ),
                iamRoles: data.iamRoles.map((r) => ({ id: r.id, type: 'IAM Role', name: r.roleName, awsId: r.roleArn }) as ArchitectureResource),
                cloudTrailTrails: data.cloudTrailTrails.map(
                    (t) =>
                        ({
                            id: t.id,
                            type: 'CloudTrail Trail',
                            name: t.name,
                            awsId: t.trailArn,
                            region: (t as unknown as { homeRegion?: string }).homeRegion,
                        }) as ArchitectureResource
                ),
                cloudWatchAlarms: data.cloudWatchAlarms.map(
                    (a) =>
                        ({
                            id: a.id,
                            type: 'CloudWatch Alarm',
                            name: a.alarmName,
                            status: a.stateValue,
                            region: (a as unknown as { region?: string }).region,
                        }) as ArchitectureResource
                ),
                guardDutyDetectors: data.guardDutyDetectors.map(
                    (g) => ({ id: g.id, type: 'GuardDuty Detector', name: g.detectorId, status: g.status ?? undefined }) as ArchitectureResource
                ),
                kmsKeys: data.kmsKeys.map(
                    (k) => ({ id: k.id, type: 'KMS Key', name: k.awsKeyId, awsId: k.keyArn, status: k.keyState ?? undefined }) as ArchitectureResource
                ),
                secretsManagerSecrets: data.secretsManagerSecrets.map(
                    (s) => ({ id: s.id, type: 'Secrets Manager Secret', name: s.name, awsId: s.secretArn }) as ArchitectureResource
                ),
                ecrRepositories: data.ecrRepositories.map(
                    (r) => ({ id: r.id, type: 'ECR Repository', name: r.repositoryName, awsId: r.repositoryArn }) as ArchitectureResource
                ),
                dynamoDbTables: data.dynamoDbTables.map(
                    (t) => ({ id: t.id, type: 'DynamoDB Table', name: t.tableName, status: t.tableStatus ?? undefined }) as ArchitectureResource
                ),
                sqsQueues: data.sqsQueues.map((q) => ({ id: q.id, type: 'SQS Queue', name: q.queueName, awsId: q.queueUrl }) as ArchitectureResource),
                snsTopics: data.snsTopics.map((t) => ({ id: t.id, type: 'SNS Topic', name: t.topicName, awsId: t.topicArn }) as ArchitectureResource),
                wafWebAcls: data.wafWebAcls.map((w) => ({ id: w.id, type: 'WAF Web ACL', name: w.name, awsId: w.webAclArn }) as ArchitectureResource),
                apiGateways: data.apiGatewayRestApis.map(
                    (a) => ({ id: a.id, type: 'API Gateway REST API', name: a.name, awsId: a.awsApiId }) as ArchitectureResource
                ),
            },
        };
    }

    buildReactFlowGraph(model: ArchitectureModel, data: AssessmentData): ReactFlowGraph {
        const nodes: ReactFlowNode[] = [];
        const edges: ReactFlowEdge[] = [];

        const nodeIds = new Set<string>();
        const edgeIds = new Set<string>();
        const typeCounters = new Map<string, number>();

        const nextPosition = (kind: string): { x: number; y: number } => {
            const columnX: Record<string, number> = {
                global: 0,
                vpc: 260,
                subnet: 520,
                routeTable: 780,
                loadBalancer: 1040,
                ec2: 1300,
                container: 1560,
                database: 1820,
                serverless: 2080,
                identity: 2340,
            };

            const count = typeCounters.get(kind) ?? 0;
            typeCounters.set(kind, count + 1);

            return {
                x: columnX[kind] ?? 2600,
                y: 80 + count * 120,
            };
        };

        const pushNode = (
            id: string,
            kind: string,
            label: string,
            resourceType: string,
            options?: {
                awsId?: string;
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
                position: nextPosition(kind),
                data: {
                    label,
                    resourceType,
                    awsId: options?.awsId,
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

            edges.push({
                id,
                source,
                target,
                label: relationship,
                type: 'smoothstep',
                animated,
                data: { relationship },
            });
        };

        const vpcById = new Map(model.vpcs.map((vpc) => [vpc.id, vpc]));
        const subnetById = new Map(data.subnets.map((subnet) => [subnet.id, subnet]));
        const subnetByAwsId = new Map(data.subnets.map((subnet) => [subnet.awsSubnetId, subnet]));
        const loadBalancerById = new Map(data.loadBalancers.map((lb) => [lb.id, lb]));
        const loadBalancerByArn = new Map(data.loadBalancers.map((lb) => [lb.awsLoadBalancerArn, lb]));
        const ecsClusterById = new Map(data.ecsClusters.map((cluster) => [cluster.id, cluster]));
        const taskDefinitionById = new Map(data.ecsTaskDefinitions.map((taskDef) => [taskDef.id, taskDef]));
        const iamRoleById = new Map(data.iamRoles.map((role) => [role.id, role]));

        const taskDefinitionIdsInUse = new Set(data.ecsServices.map((service) => service.taskDefinitionId));

        const inferRegion = (resource: ArchitectureResource): string | undefined => {
            if (resource.region) {
                return resource.region;
            }

            const details = resource.details;
            const regionFromDetails =
                details && typeof details.region === 'string'
                    ? details.region
                    : details && typeof details.awsRegion === 'string'
                      ? details.awsRegion
                      : undefined;
            return regionFromDetails;
        };

        const nodeMetaFromType = (resource: ArchitectureResource): { id: string; kind: string } => {
            const type = resource.type.toLowerCase();

            if (type === 'ec2 instance') return { id: `ec2:${resource.id}`, kind: 'ec2' };
            if (type.startsWith('load balancer listener')) return { id: `lb-listener:${resource.id}`, kind: 'loadBalancer' };
            if (type.startsWith('load balancer')) return { id: `lb:${resource.id}`, kind: 'loadBalancer' };
            if (type === 'route table') return { id: `rt:${resource.id}`, kind: 'routeTable' };
            if (type === 'security group') return { id: `sg:${resource.id}`, kind: 'identity' };
            if (type === 'rds instance') return { id: `rds:${resource.id}`, kind: 'database' };
            if (type === 'elasticache cluster') return { id: `cache:${resource.id}`, kind: 'database' };
            if (type === 'lambda function') return { id: `lambda:${resource.id}`, kind: 'serverless' };
            if (type === 'eks cluster') return { id: `eks-cluster:${resource.id}`, kind: 'container' };
            if (type === 'ecs cluster') return { id: `ecs-cluster:${resource.id}`, kind: 'container' };
            if (type === 'ecs service') return { id: `ecs-service:${resource.id}`, kind: 'container' };
            if (type === 'ecs task definition') return { id: `ecs-taskdef:${resource.id}`, kind: 'container' };
            if (type === 'iam role') return { id: `iam:${resource.id}`, kind: 'identity' };
            if (type === 'api gateway rest api') return { id: `api-gw:${resource.id}`, kind: 'serverless' };
            if (type === 's3 bucket') return { id: `s3:${resource.id}`, kind: 'global' };
            if (type === 'cloudfront distribution') return { id: `cloudfront:${resource.id}`, kind: 'global' };
            if (type === 'route53 hosted zone') return { id: `route53:${resource.id}`, kind: 'global' };
            if (type === 'cloudtrail trail') return { id: `cloudtrail:${resource.id}`, kind: 'global' };
            if (type === 'cloudwatch alarm') return { id: `cloudwatch:${resource.id}`, kind: 'global' };
            if (type === 'guardduty detector') return { id: `guardduty:${resource.id}`, kind: 'global' };
            if (type === 'kms key') return { id: `kms:${resource.id}`, kind: 'global' };
            if (type === 'secrets manager secret') return { id: `secret:${resource.id}`, kind: 'global' };
            if (type === 'ecr repository') return { id: `ecr:${resource.id}`, kind: 'global' };
            if (type === 'dynamodb table') return { id: `dynamodb:${resource.id}`, kind: 'global' };
            if (type === 'sqs queue') return { id: `sqs:${resource.id}`, kind: 'global' };
            if (type === 'sns topic') return { id: `sns:${resource.id}`, kind: 'global' };
            if (type === 'waf web acl') return { id: `waf:${resource.id}`, kind: 'global' };

            return { id: `resource:${resource.id}`, kind: 'global' };
        };

        const globalRootId = `global:${model.cloudAccountId}`;
        pushNode(globalRootId, 'global', 'Global Resources', 'Global Scope', {
            details: { cloudAccountId: model.cloudAccountId },
        });

        for (const vpc of model.vpcs) {
            const vpcNodeId = `vpc:${vpc.id}`;
            const vpcGroup = { vpcId: vpc.id, vpcName: vpc.name };

            pushNode(vpcNodeId, 'vpc', vpc.name, 'VPC', {
                awsId: vpc.awsVpcId,
                details: { cidrBlock: vpc.cidrBlock, vpcId: vpc.id, vpcName: vpc.name },
                group: vpcGroup,
            });

            for (const subnetSummary of vpc.subnets) {
                const subnet = subnetById.get(subnetSummary.id);
                const subnetNodeId = `subnet:${subnetSummary.id}`;
                pushNode(subnetNodeId, 'subnet', subnetSummary.name, 'Subnet', {
                    awsId: subnetSummary.awsSubnetId,
                    details: {
                        cidrBlock: subnetSummary.cidrBlock,
                        availabilityZone: subnetSummary.availabilityZone,
                        type: subnetSummary.type,
                        vpcId: vpc.id,
                        vpcName: vpc.name,
                    },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, subnetNodeId, 'contains');

                if (subnet?.vpcId === vpc.id) {
                    pushEdge(vpcNodeId, subnetNodeId, 'network');
                }

                for (const resource of subnetSummary.resources) {
                    const meta = nodeMetaFromType(resource);
                    pushNode(meta.id, meta.kind, resource.name, resource.type, {
                        awsId: resource.awsId,
                        status: resource.status,
                        details: { ...(resource.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                        group: vpcGroup,
                    });
                    pushEdge(subnetNodeId, meta.id, 'hosts');
                }
            }

            for (const routeTable of vpc.routeTables) {
                const meta = nodeMetaFromType(routeTable);
                pushNode(meta.id, meta.kind, routeTable.name, routeTable.type, {
                    awsId: routeTable.awsId,
                    details: { ...(routeTable.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, meta.id, 'has-route-table');
            }

            for (const securityGroup of vpc.securityGroups) {
                const meta = nodeMetaFromType(securityGroup);
                pushNode(meta.id, meta.kind, securityGroup.name, securityGroup.type, {
                    awsId: securityGroup.awsId,
                    details: { ...(securityGroup.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, meta.id, 'has-security-group');
            }

            for (const loadBalancer of vpc.loadBalancers) {
                const meta = nodeMetaFromType(loadBalancer);
                pushNode(meta.id, meta.kind, loadBalancer.name, loadBalancer.type, {
                    awsId: loadBalancer.awsId,
                    status: loadBalancer.status,
                    details: { ...(loadBalancer.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });

                if (loadBalancer.type.startsWith('Load Balancer Listener')) {
                    const listenerRow = data.loadBalancerListeners.find((listener) => listener.id === loadBalancer.id);
                    if (listenerRow) {
                        pushEdge(`lb:${listenerRow.loadBalancerId}`, meta.id, 'has-listener');
                    }
                } else {
                    pushEdge(vpcNodeId, meta.id, 'contains-load-balancer');
                }
            }

            for (const database of vpc.databases) {
                const meta = nodeMetaFromType(database);
                pushNode(meta.id, meta.kind, database.name, database.type, {
                    awsId: database.awsId,
                    status: database.status,
                    details: { ...(database.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, meta.id, 'contains-database');
            }

            for (const cache of vpc.caches) {
                const meta = nodeMetaFromType(cache);
                pushNode(meta.id, meta.kind, cache.name, cache.type, {
                    awsId: cache.awsId,
                    status: cache.status,
                    details: { ...(cache.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, meta.id, 'contains-cache');
            }

            for (const container of vpc.containers) {
                const meta = nodeMetaFromType(container);
                pushNode(meta.id, meta.kind, container.name, container.type, {
                    awsId: container.awsId,
                    status: container.status,
                    details: { ...(container.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, meta.id, 'contains-workload');
            }

            for (const fn of vpc.serverless) {
                const meta = nodeMetaFromType(fn);
                pushNode(meta.id, meta.kind, fn.name, fn.type, {
                    awsId: fn.awsId,
                    status: fn.status,
                    details: { ...(fn.details ?? {}), vpcId: vpc.id, vpcName: vpc.name },
                    group: vpcGroup,
                });
                pushEdge(vpcNodeId, meta.id, 'contains-serverless');
            }
        }

        for (const routeTable of data.routeTables) {
            const associations = routeTable.associations ?? [];
            for (const association of associations) {
                const associatedSubnet = subnetByAwsId.get(association.subnetId) ?? subnetById.get(association.subnetId);
                if (!associatedSubnet) continue;
                pushEdge(`rt:${routeTable.id}`, `subnet:${associatedSubnet.id}`, association.isMain ? 'main-route' : 'routes-subnet');
            }
        }

        for (const lb of data.loadBalancers) {
            for (const subnetId of lb.subnetIds ?? []) {
                const subnet = subnetById.get(subnetId);
                if (!subnet) continue;
                pushEdge(`lb:${lb.id}`, `subnet:${subnet.id}`, 'attached-to-subnet');
            }
        }

        for (const service of data.ecsServices) {
            const cluster = ecsClusterById.get(service.clusterId);
            if (!cluster) {
                continue;
            }

            const serviceNodeId = `ecs-service:${service.id}`;
            const clusterNodeId = `ecs-cluster:${cluster.id}`;
            pushEdge(clusterNodeId, serviceNodeId, 'runs-service', true);

            const awsvpc = (service.networkConfiguration as { awsvpcConfiguration?: { subnets?: string[] } } | null)?.awsvpcConfiguration;
            for (const subnetAwsId of awsvpc?.subnets ?? []) {
                const serviceSubnet = subnetByAwsId.get(subnetAwsId);
                if (!serviceSubnet) continue;
                pushEdge(serviceNodeId, `subnet:${serviceSubnet.id}`, 'runs-in-subnet');
            }

            const serviceLoadBalancers = (service.loadBalancers as Array<{ loadBalancerName?: string; loadBalancerArn?: string }> | null) ?? [];
            for (const serviceLoadBalancer of serviceLoadBalancers) {
                const resolvedLb =
                    (serviceLoadBalancer.loadBalancerArn ? loadBalancerByArn.get(serviceLoadBalancer.loadBalancerArn) : undefined) ??
                    (serviceLoadBalancer.loadBalancerName
                        ? data.loadBalancers.find((existingLb) => existingLb.name === serviceLoadBalancer.loadBalancerName)
                        : undefined);
                if (!resolvedLb || !loadBalancerById.has(resolvedLb.id)) continue;
                pushEdge(`lb:${resolvedLb.id}`, serviceNodeId, 'routes-traffic-to', true);
            }

            const taskDefinition = taskDefinitionById.get(service.taskDefinitionId);
            if (taskDefinition && taskDefinitionIdsInUse.has(taskDefinition.id)) {
                const taskDefNodeId = `ecs-taskdef:${taskDefinition.id}`;
                pushEdge(serviceNodeId, taskDefNodeId, 'uses-task-definition');

                if (taskDefinition.executionRoleId) {
                    const executionRole = iamRoleById.get(taskDefinition.executionRoleId);
                    if (executionRole) {
                        pushEdge(taskDefNodeId, `iam:${executionRole.id}`, 'execution-role');
                    }
                }

                if (taskDefinition.taskRoleId) {
                    const taskRole = iamRoleById.get(taskDefinition.taskRoleId);
                    if (taskRole) {
                        pushEdge(taskDefNodeId, `iam:${taskRole.id}`, 'task-role');
                    }
                }
            }

            if (service.serviceRoleId) {
                const serviceRole = iamRoleById.get(service.serviceRoleId);
                if (serviceRole) {
                    pushEdge(serviceNodeId, `iam:${serviceRole.id}`, 'service-role');
                }
            }
        }

        const globalCollections = [
            { relationship: 'contains-s3', items: model.globalResources.s3Buckets },
            { relationship: 'contains-cloudfront', items: model.globalResources.cloudFrontDistributions },
            { relationship: 'contains-route53', items: model.globalResources.route53HostedZones },
            { relationship: 'contains-iam', items: model.globalResources.iamRoles },
            { relationship: 'contains-cloudtrail', items: model.globalResources.cloudTrailTrails },
            { relationship: 'contains-cloudwatch', items: model.globalResources.cloudWatchAlarms },
            { relationship: 'contains-guardduty', items: model.globalResources.guardDutyDetectors },
            { relationship: 'contains-kms', items: model.globalResources.kmsKeys },
            { relationship: 'contains-secrets', items: model.globalResources.secretsManagerSecrets },
            { relationship: 'contains-ecr', items: model.globalResources.ecrRepositories },
            { relationship: 'contains-dynamodb', items: model.globalResources.dynamoDbTables },
            { relationship: 'contains-sqs', items: model.globalResources.sqsQueues },
            { relationship: 'contains-sns', items: model.globalResources.snsTopics },
            { relationship: 'contains-waf', items: model.globalResources.wafWebAcls },
            { relationship: 'contains-api', items: model.globalResources.apiGateways },
        ];

        for (const collection of globalCollections) {
            for (const resource of collection.items) {
                const meta = nodeMetaFromType(resource);
                const region = inferRegion(resource);

                pushNode(meta.id, meta.kind, resource.name, resource.type, {
                    awsId: resource.awsId,
                    status: resource.status,
                    details: resource.details,
                    group: region ? { region } : undefined,
                });
                pushEdge(globalRootId, meta.id, collection.relationship);
            }
        }

        for (const route53 of model.globalResources.route53HostedZones) {
            for (const cloudFront of model.globalResources.cloudFrontDistributions) {
                pushEdge(nodeMetaFromType(route53).id, nodeMetaFromType(cloudFront).id, 'dns');
            }
        }

        for (const cloudFront of model.globalResources.cloudFrontDistributions) {
            for (const vpc of model.vpcs) {
                for (const loadBalancer of vpc.loadBalancers.filter((resource) => resource.type.startsWith('Load Balancer ('))) {
                    pushEdge(nodeMetaFromType(cloudFront).id, nodeMetaFromType(loadBalancer).id, 'http-s');
                }
            }
        }

        const allLambdas = model.vpcs.flatMap((vpc) => vpc.serverless.filter((resource) => resource.type === 'Lambda Function'));
        for (const api of model.globalResources.apiGateways) {
            for (const lambda of allLambdas) {
                pushEdge(nodeMetaFromType(api).id, nodeMetaFromType(lambda).id, 'invoke');
            }
        }

        return { nodes, edges };
    }

    buildMermaidDiagram(model: ArchitectureModel): string {
        const lines: string[] = ['%%{init: {"flowchart": {"nodeSpacing": 110, "rankSpacing": 90, "curve": "linear"}}}%%', 'graph TB', ''];

        const mid = (id: string) => `node_${id.replace(/-/g, '_')}`;
        const mLabel = (text: string) =>
            text
                .replace(/["\[\]{}]/g, ' ')
                .trim()
                .substring(0, 32);

        const renderGlobalBlock = (id: string, title: string, items: ArchitectureResource[], prefix: string) => {
            if (items.length === 0) return;
            lines.push(`        subgraph ${id}["${title}"]`);
            items.forEach((r) => lines.push(`            ${mid(r.id)}["${prefix}${mLabel(r.name)}"]`));
            lines.push('        end');
        };

        const { globalResources } = model;
        lines.push('    subgraph GLOBAL["Global Resources"]');
        renderGlobalBlock('S3', 'S3 Buckets', globalResources.s3Buckets, 'S3: ');
        renderGlobalBlock('CF', 'CloudFront', globalResources.cloudFrontDistributions, 'CF: ');
        renderGlobalBlock('R53', 'Route53', globalResources.route53HostedZones, 'R53: ');
        renderGlobalBlock('APIGW', 'API Gateway', globalResources.apiGateways, 'API: ');
        renderGlobalBlock('IAM', 'IAM Roles', globalResources.iamRoles, 'IAM: ');
        renderGlobalBlock('CT', 'CloudTrail', globalResources.cloudTrailTrails, 'Trail: ');
        renderGlobalBlock('CW', 'CloudWatch', globalResources.cloudWatchAlarms, 'Alarm: ');
        renderGlobalBlock('GD', 'GuardDuty', globalResources.guardDutyDetectors, 'GD: ');
        renderGlobalBlock('KMS', 'KMS Keys', globalResources.kmsKeys, 'KMS: ');
        renderGlobalBlock('SECRETS', 'Secrets Manager', globalResources.secretsManagerSecrets, 'Secret: ');
        renderGlobalBlock('ECR', 'ECR Repositories', globalResources.ecrRepositories, 'ECR: ');
        renderGlobalBlock('DYNAMO', 'DynamoDB', globalResources.dynamoDbTables, 'DDB: ');
        renderGlobalBlock('SQS', 'SQS', globalResources.sqsQueues, 'SQS: ');
        renderGlobalBlock('SNS', 'SNS', globalResources.snsTopics, 'SNS: ');
        renderGlobalBlock('WAF', 'WAF', globalResources.wafWebAcls, 'WAF: ');
        lines.push('    end', '');

        for (const vpc of model.vpcs) {
            const vpcId = mid(vpc.id);
            const vpcRootId = `${vpcId}_ROOT`;
            lines.push(`    subgraph ${vpcId}["VPC: ${mLabel(vpc.name)} (${vpc.cidrBlock})"]`);
            lines.push(`        ${vpcRootId}["VPC: ${mLabel(vpc.name)}"]`);

            const allSubnets = vpc.subnets;
            if (allSubnets.length > 0) {
                lines.push(`        subgraph ${vpcId}_NETWORK["Network"]`);
                allSubnets.forEach((subnet) => {
                    const snId = mid(subnet.id);
                    const snType = subnet.type === 'public' ? 'PUBLIC' : subnet.type === 'private' ? 'PRIVATE' : 'UNKNOWN';
                    lines.push(`            ${snId}["${snType} ${mLabel(subnet.name)} (${subnet.cidrBlock})"]`);
                });
                lines.push('        end');
            }

            if (vpc.routeTables.length > 0) {
                lines.push(`        subgraph ${vpcId}_RT["Route Tables"]`);
                vpc.routeTables.forEach((rt) => lines.push(`            ${mid(rt.id)}["RT: ${mLabel(rt.name)}"]`));
                lines.push('        end');
            }

            if (vpc.securityGroups.length > 0) {
                lines.push(`        subgraph ${vpcId}_SG["Security Groups"]`);
                vpc.securityGroups.forEach((sg) => lines.push(`            ${mid(sg.id)}["SG: ${mLabel(sg.name)}"]`));
                lines.push('        end');
            }

            const lbResources = vpc.loadBalancers;
            if (lbResources.length > 0) {
                lines.push(`        subgraph ${vpcId}_LB["Load Balancers"]`);
                lbResources.forEach((lb) => lines.push(`            ${mid(lb.id)}["${mLabel(lb.type)}: ${mLabel(lb.name)}"]`));
                lines.push('        end');
            }

            const ec2BySubnet = allSubnets.map((subnet) => ({
                subnet,
                ec2: subnet.resources.filter((r) => r.type === 'EC2 Instance'),
            }));
            const hasEc2 = ec2BySubnet.some((s) => s.ec2.length > 0);
            if (hasEc2) {
                lines.push(`        subgraph ${vpcId}_COMPUTE["Compute (EC2)"]`);
                for (const item of ec2BySubnet) {
                    for (const ec2 of item.ec2) {
                        lines.push(`            ${mid(ec2.id)}["EC2: ${mLabel(ec2.name)}"]`);
                    }
                }
                lines.push('        end');
            }

            if (vpc.databases.length > 0 || vpc.caches.length > 0) {
                lines.push(`        subgraph ${vpcId}_DATA["Data"]`);
                vpc.databases.forEach((db) => lines.push(`            ${mid(db.id)}["DB: ${mLabel(db.name)}"]`));
                vpc.caches.forEach((cache) => lines.push(`            ${mid(cache.id)}["Cache: ${mLabel(cache.name)}"]`));
                lines.push('        end');
            }

            if (vpc.containers.length > 0) {
                lines.push(`        subgraph ${vpcId}_CONTAINERS["Containers"]`);
                vpc.containers.forEach((c) => lines.push(`            ${mid(c.id)}["${mLabel(c.type)}: ${mLabel(c.name)}"]`));
                lines.push('        end');
            }

            if (vpc.serverless.length > 0) {
                lines.push(`        subgraph ${vpcId}_SERVERLESS["Serverless"]`);
                vpc.serverless.forEach((fn) => lines.push(`            ${mid(fn.id)}["Lambda: ${mLabel(fn.name)}"]`));
                lines.push('        end');
            }

            lines.push('    end', '');

            for (const subnet of allSubnets) {
                lines.push(`    ${vpcRootId} -->|contains| ${mid(subnet.id)}`);
            }

            for (const item of ec2BySubnet) {
                for (const ec2 of item.ec2) {
                    lines.push(`    ${mid(item.subnet.id)} -->|hosts| ${mid(ec2.id)}`);
                }
            }

            const ec2Targets = ec2BySubnet.flatMap((item) => item.ec2);
            for (const lb of lbResources) {
                for (const ec2 of ec2Targets) {
                    lines.push(`    ${mid(lb.id)} -->|targets| ${mid(ec2.id)}`);
                }
            }

            lbResources.forEach((lb) => lines.push(`    ${vpcRootId} -->|exposes| ${mid(lb.id)}`));
            vpc.routeTables.forEach((rt) => lines.push(`    ${vpcRootId} -->|routes| ${mid(rt.id)}`));
            vpc.securityGroups.forEach((sg) => lines.push(`    ${vpcRootId} -->|protects| ${mid(sg.id)}`));
            vpc.databases.forEach((db) => lines.push(`    ${vpcRootId} -->|stores| ${mid(db.id)}`));
            vpc.caches.forEach((cache) => lines.push(`    ${vpcRootId} -->|accelerates| ${mid(cache.id)}`));
            vpc.containers.forEach((c) => lines.push(`    ${vpcRootId} -->|runs| ${mid(c.id)}`));
            vpc.serverless.forEach((fn) => lines.push(`    ${vpcRootId} -->|executes| ${mid(fn.id)}`));
        }

        for (const r53 of globalResources.route53HostedZones) {
            for (const cf of globalResources.cloudFrontDistributions) {
                lines.push(`    ${mid(r53.id)} -->|DNS| ${mid(cf.id)}`);
            }
        }

        for (const cf of globalResources.cloudFrontDistributions) {
            for (const vpc of model.vpcs) {
                vpc.loadBalancers.forEach((lb) => lines.push(`    ${mid(cf.id)} -->|HTTP/S| ${mid(lb.id)}`));
            }
        }

        const allLambdas = model.vpcs.flatMap((vpc) => vpc.serverless.filter((r) => r.type === 'Lambda Function'));
        for (const api of globalResources.apiGateways) {
            for (const lambda of allLambdas) {
                lines.push(`    ${mid(api.id)} -->|invoke| ${mid(lambda.id)}`);
            }
        }

        return lines.join('\n');
    }
}
