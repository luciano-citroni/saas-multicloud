import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
    DescribeCacheClustersCommand,
    ListTagsForResourceCommand,
    type CacheCluster,
} from '@aws-sdk/client-elasticache';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsElastiCacheCluster, AwsVpc, AwsSecurityGroup } from '../../db/entites';

@Injectable()
export class AwsElastiCacheService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsElastiCacheCluster)
        private readonly clusterRepository: Repository<AwsElastiCacheCluster>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>
    ) {}

    async listClustersFromDatabase(cloudAccountId: string) {
        const clusters = await this.clusterRepository
            .createQueryBuilder('cluster')
            .leftJoinAndSelect('cluster.vpc', 'vpc')
            .where('cluster.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('cluster.cacheClusterId', 'ASC')
            .getMany();

        return clusters.map(mapDbCluster);
    }

    async getClusterById(clusterId: string, cloudAccountId: string) {
        const cluster = await this.clusterRepository
            .createQueryBuilder('cluster')
            .leftJoinAndSelect('cluster.vpc', 'vpc')
            .where('cluster.id = :clusterId', { clusterId })
            .andWhere('cluster.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!cluster) {
            throw new BadRequestException(`Cluster ElastiCache com ID "${clusterId}" não encontrado.`);
        }

        return mapDbCluster(cluster);
    }

    async syncClustersFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getElastiCacheClient(cloudAccountId, organizationId);

        const { CacheClusters } = await client.send(new DescribeCacheClustersCommand({ ShowCacheNodeInfo: true })).catch(() => {
            throw new BadRequestException('Falha ao listar clusters ElastiCache. Verifique as permissões da role (elasticache:DescribeCacheClusters).');
        });

        if (!CacheClusters || CacheClusters.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsCluster>[] = [];

        for (const cluster of CacheClusters) {
            if (!cluster.CacheClusterId) continue;

            let tags: Record<string, string> = {};
            if (cluster.ARN) {
                try {
                    const { TagList } = await client.send(new ListTagsForResourceCommand({ ResourceName: cluster.ARN }));
                    tags = TagList?.reduce<Record<string, string>>((acc, t) => {
                        if (t.Key) acc[t.Key] = t.Value ?? '';
                        return acc;
                    }, {}) ?? {};
                } catch {
                    console.warn(`Não foi possível obter tags do cluster ${cluster.CacheClusterId}.`);
                }
            }

            const awsSecurityGroupIds = cluster.SecurityGroups?.map((sg) => sg.SecurityGroupId!).filter(Boolean) ?? [];

            const vpc = null as AwsVpc | null;

            const securityGroupIds = awsSecurityGroupIds.length
                ? await this.securityGroupRepository
                      .find({ where: { cloudAccountId, awsSecurityGroupId: In(awsSecurityGroupIds) } })
                      .then((sgs) => sgs.map((sg) => sg.id))
                : null;

            const clusterData = mapAwsCluster(cluster, tags);
            mapped.push(clusterData);

            let dbCluster = await this.clusterRepository.findOne({ where: { cacheClusterId: cluster.CacheClusterId } });

            if (dbCluster) {
                dbCluster.clusterArn = clusterData.clusterArn;
                dbCluster.cacheClusterStatus = clusterData.cacheClusterStatus;
                dbCluster.cacheNodeType = clusterData.cacheNodeType;
                dbCluster.engine = clusterData.engine;
                dbCluster.engineVersion = clusterData.engineVersion;
                dbCluster.numCacheNodes = clusterData.numCacheNodes;
                dbCluster.cacheSubnetGroupName = clusterData.cacheSubnetGroupName;
                dbCluster.awsSecurityGroupIds = awsSecurityGroupIds.length ? awsSecurityGroupIds : null;
                dbCluster.securityGroupIds = securityGroupIds;
                dbCluster.configurationEndpoint = clusterData.configurationEndpoint;
                dbCluster.port = clusterData.port;
                dbCluster.multiAz = clusterData.multiAz;
                dbCluster.autoMinorVersionUpgrade = clusterData.autoMinorVersionUpgrade;
                dbCluster.tags = tags;
                dbCluster.lastSyncedAt = now;
            } else {
                dbCluster = this.clusterRepository.create({
                    cloudAccountId,
                    ...clusterData,
                    awsSecurityGroupIds: awsSecurityGroupIds.length ? awsSecurityGroupIds : null,
                    securityGroupIds,
                    awsVpcId: null,
                    vpcId: null,
                    tags,
                    lastSyncedAt: now,
                });
            }

            await this.clusterRepository.save(dbCluster);
        }

        return mapped;
    }
}

function mapAwsCluster(c: CacheCluster, tags: Record<string, string>) {
    const endpoint = c.ConfigurationEndpoint ?? c.CacheNodes?.[0]?.Endpoint;
    return {
        cacheClusterId: c.CacheClusterId ?? '',
        clusterArn: c.ARN ?? null,
        cacheClusterStatus: c.CacheClusterStatus ?? null,
        cacheNodeType: c.CacheNodeType ?? null,
        engine: c.Engine ?? null,
        engineVersion: c.EngineVersion ?? null,
        numCacheNodes: c.NumCacheNodes ?? null,
        cacheSubnetGroupName: c.CacheSubnetGroupName ?? null,
        configurationEndpoint: endpoint?.Address ?? null,
        port: endpoint?.Port ?? null,
        multiAz: (c as any).MultiAZ === 'enabled',
        autoMinorVersionUpgrade: c.AutoMinorVersionUpgrade ?? false,
        createdAtAws: c.CacheClusterCreateTime ?? null,
        tags,
    };
}

function mapDbCluster(cluster: AwsElastiCacheCluster) {
    return {
        id: cluster.id,
        cloudAccountId: cluster.cloudAccountId,
        cacheClusterId: cluster.cacheClusterId,
        clusterArn: cluster.clusterArn,
        cacheClusterStatus: cluster.cacheClusterStatus,
        cacheNodeType: cluster.cacheNodeType,
        engine: cluster.engine,
        engineVersion: cluster.engineVersion,
        numCacheNodes: cluster.numCacheNodes,
        cacheSubnetGroupName: cluster.cacheSubnetGroupName,
        awsSecurityGroupIds: cluster.awsSecurityGroupIds ?? [],
        securityGroupIds: cluster.securityGroupIds ?? [],
        awsVpcId: cluster.awsVpcId,
        vpcId: cluster.vpcId,
        configurationEndpoint: cluster.configurationEndpoint,
        port: cluster.port,
        multiAz: cluster.multiAz,
        autoMinorVersionUpgrade: cluster.autoMinorVersionUpgrade,
        createdAtAws: cluster.createdAtAws,
        tags: cluster.tags ?? {},
        lastSyncedAt: cluster.lastSyncedAt,
        createdAt: cluster.createdAt,
        updatedAt: cluster.updatedAt,
        vpc: cluster.vpc
            ? { id: cluster.vpc.id, awsVpcId: cluster.vpc.awsVpcId, cidrBlock: cluster.vpc.cidrBlock, state: cluster.vpc.state }
            : null,
    };
}
