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

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AwsAssessmentArchitectureService {
    buildArchitectureModel(cloudAccountId: string, data: AssessmentData): ArchitectureModel {
        // vpcMap keyed by UUID (vpc.id) — covers all entity FK lookups
        const vpcMap = new Map<string, ArchitectureVpc>();

        for (const vpc of data.vpcs) {
            vpcMap.set(vpc.id, {
                id: vpc.id,
                awsVpcId: vpc.awsVpcId,
                name: vpc.tags?.['Name'] ?? vpc.awsVpcId,
                cidrBlock: vpc.cidrBlock,
                subnets: [],
                securityGroups: [],
                routeTables: [],
                loadBalancers: [],
                databases: [],
                containers: [],
                serverless: [],
                caches: [],
            });
        }

        // Subnets → VPC (vpcId UUID FK)
        for (const subnet of data.subnets) {
            const vpc = vpcMap.get(subnet.vpcId ?? '');
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

            // Assign EC2 instances to this subnet
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
                            details: { instanceType: ec2.instanceType, privateIp: ec2.privateIpAddress, publicIp: ec2.publicIpAddress },
                        }) as ArchitectureResource
                )
            );

            if (vpc) {
                vpc.subnets.push(subnetResource);
            }
        }

        // Security Groups → VPC
        for (const sg of data.securityGroups) {
            const vpc = vpcMap.get(sg.vpcId ?? '');
            if (vpc) {
                vpc.securityGroups.push({ id: sg.id, type: 'Security Group', name: sg.name, awsId: sg.awsSecurityGroupId });
            }
        }

        // Route Tables → VPC
        for (const rt of data.routeTables) {
            const vpc = vpcMap.get(rt.vpcId ?? '');
            if (vpc) {
                vpc.routeTables.push({ id: rt.id, type: 'Route Table', name: rt.tags?.['Name'] ?? rt.awsRouteTableId, awsId: rt.awsRouteTableId });
            }
        }

        // Load Balancers → VPC
        for (const lb of data.loadBalancers) {
            const vpc = vpcMap.get(lb.vpcId ?? '');
            const resource: ArchitectureResource = {
                id: lb.id,
                type: `Load Balancer (${lb.type})`,
                name: lb.name,
                awsId: lb.awsLoadBalancerArn,
                status: lb.state,
                details: { scheme: lb.scheme, dnsName: lb.dnsName },
            };
            if (vpc) vpc.loadBalancers.push(resource);
        }

        // RDS Instances → VPC
        for (const rds of data.rdsInstances) {
            const vpc = vpcMap.get(rds.vpcId ?? '');
            const resource: ArchitectureResource = {
                id: rds.id,
                type: 'RDS Instance',
                name: rds.awsDbInstanceIdentifier,
                awsId: rds.dbInstanceArn ?? undefined,
                status: rds.status,
                details: { engine: rds.engine, engineVersion: rds.engineVersion, instanceClass: rds.dbInstanceClass },
            };
            if (vpc) vpc.databases.push(resource);
        }

        // ECS Clusters (no direct VPC — attach to first VPC)
        for (const cluster of data.ecsClusters) {
            const resource: ArchitectureResource = {
                id: cluster.id,
                type: 'ECS Cluster',
                name: cluster.clusterName,
                awsId: cluster.clusterArn,
                status: cluster.status,
                details: { runningTasksCount: cluster.runningTasksCount, activeServicesCount: cluster.activeServicesCount },
            };
            const firstVpc = vpcMap.values().next().value as ArchitectureVpc | undefined;
            if (firstVpc) firstVpc.containers.push(resource);
        }

        // EKS Clusters → VPC
        for (const eks of data.eksClusters) {
            const resource: ArchitectureResource = {
                id: eks.id,
                type: 'EKS Cluster',
                name: eks.clusterName,
                awsId: eks.clusterArn,
                status: eks.status,
                details: { version: eks.version, endpoint: eks.endpoint },
            };
            const vpc = vpcMap.get(eks.vpcId ?? '');
            if (vpc) {
                vpc.containers.push(resource);
            } else {
                const firstVpc = vpcMap.values().next().value as ArchitectureVpc | undefined;
                if (firstVpc) firstVpc.containers.push(resource);
            }
        }

        // Lambda Functions → VPC
        for (const fn of data.lambdaFunctions) {
            const resource: ArchitectureResource = {
                id: fn.id,
                type: 'Lambda Function',
                name: fn.functionName,
                awsId: fn.functionArn,
                status: fn.state ?? undefined,
                details: { runtime: fn.runtime, memorySize: fn.memorySize },
            };
            if (fn.vpcId) {
                const vpc = vpcMap.get(fn.vpcId);
                if (vpc) {
                    vpc.serverless.push(resource);
                    continue;
                }
            }
            // non-VPC Lambda — attach to first VPC if any
            const firstVpc = vpcMap.values().next().value as ArchitectureVpc | undefined;
            if (firstVpc) firstVpc.serverless.push(resource);
        }

        // ElastiCache → VPC
        for (const cache of data.elastiCacheClusters) {
            const resource: ArchitectureResource = {
                id: cache.id,
                type: 'ElastiCache Cluster',
                name: cache.cacheClusterId,
                awsId: cache.clusterArn ?? undefined,
                status: cache.cacheClusterStatus ?? undefined,
                details: { engine: cache.engine, nodeType: cache.cacheNodeType },
            };
            const vpc = vpcMap.get(cache.vpcId ?? '');
            if (vpc) {
                vpc.caches.push(resource);
            } else {
                const firstVpc = vpcMap.values().next().value as ArchitectureVpc | undefined;
                if (firstVpc) firstVpc.caches.push(resource);
            }
        }

        return {
            cloudAccountId,
            generatedAt: new Date().toISOString(),
            vpcs: Array.from(vpcMap.values()),
            globalResources: {
                s3Buckets: data.s3Buckets.map(
                    (b) => ({ id: b.id, type: 'S3 Bucket', name: b.bucketName, details: { region: b.region } }) as ArchitectureResource
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
                    (t) => ({ id: t.id, type: 'CloudTrail Trail', name: t.name, awsId: t.trailArn }) as ArchitectureResource
                ),
                cloudWatchAlarms: data.cloudWatchAlarms.map(
                    (a) => ({ id: a.id, type: 'CloudWatch Alarm', name: a.alarmName, status: a.stateValue }) as ArchitectureResource
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

    buildMermaidDiagram(model: ArchitectureModel): string {
        // Ajustes de layout via init: aumenta espaçamento entre nós e camadas
        const lines: string[] = ['%%{init: {"flowchart": {"nodeSpacing": 120, "rankSpacing": 80, "curve": "linear"}}}%%', 'graph TB', ''];
        const limits = {
            maxVpcs: 6,
            maxSubnetsPerVpc: 8,
            maxEc2PerSubnet: 6,
            maxLoadBalancersPerVpc: 5,
            maxDatabasesPerVpc: 4,
            maxContainersPerVpc: 4,
            maxCachesPerVpc: 4,
            maxS3: 6,
            maxCloudFront: 4,
            maxRoute53: 4,
            maxApiGateway: 4,
            maxSqs: 4,
            maxSns: 4,
            maxDynamo: 4,
            maxKms: 4,
            maxSecrets: 4,
            maxWaf: 3,
            maxGuardDuty: 3,
            maxCfEdges: 2,
            maxLbTargetsPerLb: 3,
            maxDnsEdges: 2,
        };

        const mid = (id: string) => `node_${id.replace(/-/g, '_')}`;
        const mLabel = (text: string) =>
            text
                .replace(/["\[\]{}]/g, ' ')
                .trim()
                .substring(0, 32);

        const renderGlobalBlock = (id: string, title: string, items: ArchitectureResource[], limit: number) => {
            if (items.length === 0) return;
            lines.push(`        subgraph ${id}["${title}"]`);
            const shown = items.slice(0, limit);
            shown.forEach((r) => lines.push(`            ${mid(r.id)}["${mLabel(r.name)}"]`));
            if (items.length > shown.length) {
                lines.push(`            ${id}_more["+${items.length - shown.length} omitidos"]`);
            }
            lines.push('        end');
        };

        const { globalResources } = model;
        lines.push('    subgraph GLOBAL["☁️ Global Resources"]');
        renderGlobalBlock('S3', '🪣 S3 Buckets', globalResources.s3Buckets, limits.maxS3);
        renderGlobalBlock('CF', '🌐 CloudFront', globalResources.cloudFrontDistributions, limits.maxCloudFront);
        renderGlobalBlock('R53', '🔗 Route53', globalResources.route53HostedZones, limits.maxRoute53);
        renderGlobalBlock('APIGW', '🔌 API Gateway', globalResources.apiGateways, limits.maxApiGateway);
        lines.push('    end', '');

        const shownVpcs = model.vpcs.slice(0, limits.maxVpcs);
        for (const vpc of shownVpcs) {
            const vpcId = mid(vpc.id);
            const vpcRootId = `${vpcId}_ROOT`;
            lines.push(`    subgraph ${vpcId}["🏗️ VPC: ${mLabel(vpc.name)} (${vpc.cidrBlock})"]`);
            lines.push(`        ${vpcRootId}["VPC: ${mLabel(vpc.name)}"]`);

            // NETWORK BLOCK
            const shownSubnets = vpc.subnets.slice(0, limits.maxSubnetsPerVpc);
            if (shownSubnets.length > 0) {
                lines.push(`        subgraph ${vpcId}_NETWORK["🌐 Network"]`);
                shownSubnets.forEach((subnet) => {
                    const snId = mid(subnet.id);
                    const snType = subnet.type === 'public' ? '🌍' : '🔒';
                    lines.push(`            ${snId}["${snType} ${mLabel(subnet.name)} (${subnet.cidrBlock})"]`);
                });
                if (vpc.subnets.length > shownSubnets.length) {
                    lines.push(`            ${vpcId}_NETWORK_more["+${vpc.subnets.length - shownSubnets.length} subnets omitidas"]`);
                }
                lines.push('        end');
            }

            // LOAD BALANCER BLOCK
            const shownLbs = vpc.loadBalancers.slice(0, limits.maxLoadBalancersPerVpc);
            if (shownLbs.length > 0) {
                lines.push(`        subgraph ${vpcId}_LB["⚖️ Load Balancers"]`);
                shownLbs.forEach((lb) => lines.push(`            ${mid(lb.id)}["ALB/NLB: ${mLabel(lb.name)}"]`));
                if (vpc.loadBalancers.length > shownLbs.length) {
                    lines.push(`            ${vpcId}_LB_more["+${vpc.loadBalancers.length - shownLbs.length} LBs omitidos"]`);
                }
                lines.push('        end');
            }

            // COMPUTE BLOCK (EC2)
            const ec2BySubnet = shownSubnets.map((subnet) => ({
                subnet,
                ec2: subnet.resources.filter((r) => r.type === 'EC2 Instance').slice(0, limits.maxEc2PerSubnet),
                totalEc2: subnet.resources.filter((r) => r.type === 'EC2 Instance').length,
            }));
            const hasEc2 = ec2BySubnet.some((s) => s.ec2.length > 0);
            if (hasEc2) {
                lines.push(`        subgraph ${vpcId}_COMPUTE["🖥️ Compute (EC2)"]`);
                for (const item of ec2BySubnet) {
                    for (const ec2 of item.ec2) {
                        lines.push(`            ${mid(ec2.id)}["EC2: ${mLabel(ec2.name)}"]`);
                    }
                    if (item.totalEc2 > item.ec2.length) {
                        lines.push(`            ${mid(item.subnet.id)}_ec2_more["+${item.totalEc2 - item.ec2.length} EC2 omitidas"]`);
                    }
                }
                lines.push('        end');
            }

            // DATA BLOCK
            const shownDb = vpc.databases.slice(0, limits.maxDatabasesPerVpc);
            const shownCache = vpc.caches.slice(0, limits.maxCachesPerVpc);
            if (shownDb.length > 0 || shownCache.length > 0) {
                lines.push(`        subgraph ${vpcId}_DATA["🗄️ Data"]`);
                shownDb.forEach((db) => lines.push(`            ${mid(db.id)}["DB: ${mLabel(db.name)}"]`));
                shownCache.forEach((cache) => lines.push(`            ${mid(cache.id)}["Cache: ${mLabel(cache.name)}"]`));
                if (vpc.databases.length > shownDb.length) {
                    lines.push(`            ${vpcId}_DATA_db_more["+${vpc.databases.length - shownDb.length} DBs omitidos"]`);
                }
                if (vpc.caches.length > shownCache.length) {
                    lines.push(`            ${vpcId}_DATA_cache_more["+${vpc.caches.length - shownCache.length} caches omitidos"]`);
                }
                lines.push('        end');
            }

            // CONTAINERS BLOCK
            const shownContainers = vpc.containers.slice(0, limits.maxContainersPerVpc);
            if (shownContainers.length > 0) {
                lines.push(`        subgraph ${vpcId}_CONTAINERS["📦 Containers"]`);
                shownContainers.forEach((c) => lines.push(`            ${mid(c.id)}["${mLabel(c.type)}: ${mLabel(c.name)}"]`));
                if (vpc.containers.length > shownContainers.length) {
                    lines.push(`            ${vpcId}_CONTAINERS_more["+${vpc.containers.length - shownContainers.length} containers omitidos"]`);
                }
                lines.push('        end');
            }

            lines.push('    end', '');

            // Links: VPC -> Subnet
            for (const subnet of shownSubnets) {
                lines.push(`    ${vpcRootId} -->|contains| ${mid(subnet.id)}`);
            }

            // Links: Subnet -> EC2
            for (const item of ec2BySubnet) {
                for (const ec2 of item.ec2) {
                    lines.push(`    ${mid(item.subnet.id)} -->|hosts| ${mid(ec2.id)}`);
                }
            }

            // Links: ALB -> EC2 (heuristica por VPC)
            const ec2Targets = ec2BySubnet.flatMap((item) => item.ec2).slice(0, limits.maxLbTargetsPerLb);
            for (const lb of shownLbs) {
                for (const ec2 of ec2Targets) {
                    lines.push(`    ${mid(lb.id)} -->|targets| ${mid(ec2.id)}`);
                }
            }

            // Links: VPC -> LB/DB/Cache/Containers
            shownLbs.forEach((lb) => lines.push(`    ${vpcRootId} -->|exposes| ${mid(lb.id)}`));
            shownDb.forEach((db) => lines.push(`    ${vpcRootId} -->|stores| ${mid(db.id)}`));
            shownCache.forEach((cache) => lines.push(`    ${vpcRootId} -->|accelerates| ${mid(cache.id)}`));
            shownContainers.forEach((c) => lines.push(`    ${vpcRootId} -->|runs| ${mid(c.id)}`));
        }

        if (model.vpcs.length > shownVpcs.length) {
            lines.push('', `    VPCS_MORE["+${model.vpcs.length - shownVpcs.length} VPCs omitidas"]`);
        }

        const { sqsQueues, snsTopics, dynamoDbTables } = globalResources;
        if (sqsQueues.length > 0 || snsTopics.length > 0 || dynamoDbTables.length > 0) {
            lines.push('', '    subgraph MESSAGING["📨 Messaging & Storage"]');
            sqsQueues.slice(0, limits.maxSqs).forEach((q) => lines.push(`        ${mid(q.id)}["SQS: ${mLabel(q.name)}"]`));
            snsTopics.slice(0, limits.maxSns).forEach((t) => lines.push(`        ${mid(t.id)}["SNS: ${mLabel(t.name)}"]`));
            dynamoDbTables.slice(0, limits.maxDynamo).forEach((t) => lines.push(`        ${mid(t.id)}["DynamoDB: ${mLabel(t.name)}"]`));
            lines.push('    end');
        }

        const { kmsKeys, secretsManagerSecrets, wafWebAcls, guardDutyDetectors } = globalResources;
        if (kmsKeys.length > 0 || secretsManagerSecrets.length > 0 || wafWebAcls.length > 0 || guardDutyDetectors.length > 0) {
            lines.push('', '    subgraph SECURITY["🔐 Security"]');
            kmsKeys.slice(0, limits.maxKms).forEach((k) => lines.push(`        ${mid(k.id)}["KMS: ${mLabel(k.name)}"]`));
            secretsManagerSecrets.slice(0, limits.maxSecrets).forEach((s) => lines.push(`        ${mid(s.id)}["Secret: ${mLabel(s.name)}"]`));
            wafWebAcls.slice(0, limits.maxWaf).forEach((w) => lines.push(`        ${mid(w.id)}["WAF: ${mLabel(w.name)}"]`));
            guardDutyDetectors.slice(0, limits.maxGuardDuty).forEach((g) => lines.push(`        ${mid(g.id)}["GuardDuty: ${mLabel(g.name)}"]`));
            lines.push('    end');
        }

        for (const r53 of globalResources.route53HostedZones.slice(0, limits.maxDnsEdges)) {
            for (const cf of globalResources.cloudFrontDistributions.slice(0, limits.maxDnsEdges)) {
                lines.push(`    ${mid(r53.id)} -->|DNS| ${mid(cf.id)}`);
            }
        }

        for (const cf of globalResources.cloudFrontDistributions.slice(0, limits.maxCfEdges)) {
            for (const vpc of shownVpcs) {
                const shownLbs = vpc.loadBalancers.slice(0, 1);
                shownLbs.forEach((lb) => lines.push(`    ${mid(cf.id)} -->|HTTP/S| ${mid(lb.id)}`));
            }
        }

        return lines.join('\n');
    }
}
