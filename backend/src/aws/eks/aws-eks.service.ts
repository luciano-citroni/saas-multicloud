import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ListClustersCommand, DescribeClusterCommand, type Cluster } from '@aws-sdk/client-eks';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsEksCluster, AwsVpc, AwsSecurityGroup, AwsIamRole, AwsEc2Instance } from '../../db/entites';

@Injectable()
export class AwsEksService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsEksCluster)
        private readonly eksRepository: Repository<AwsEksCluster>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>,
        @InjectRepository(AwsIamRole)
        private readonly iamRoleRepository: Repository<AwsIamRole>,
        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repository: Repository<AwsEc2Instance>
    ) {}

    async listClustersFromDatabase(cloudAccountId: string) {
        const clusters = await this.eksRepository
            .createQueryBuilder('eks')
            .leftJoinAndSelect('eks.vpc', 'vpc')
            .leftJoinAndSelect('eks.iamRole', 'iamRole')
            .where('eks.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('eks.clusterName', 'ASC')
            .getMany();

        return clusters.map(mapDbCluster);
    }

    async getClusterById(clusterId: string, cloudAccountId: string) {
        const cluster = await this.eksRepository
            .createQueryBuilder('eks')
            .leftJoinAndSelect('eks.vpc', 'vpc')
            .leftJoinAndSelect('eks.iamRole', 'iamRole')
            .where('eks.id = :clusterId', { clusterId })
            .andWhere('eks.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!cluster) {
            throw new BadRequestException(`Cluster EKS com ID "${clusterId}" não encontrado.`);
        }

        return mapDbCluster(cluster);
    }

    async syncClustersFromAws(cloudAccountId: string, organizationId: string) {
        const eks = await this.connector.getEksClient(cloudAccountId, organizationId);

        const { clusters } = await eks.send(new ListClustersCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar clusters EKS na AWS. Verifique as permissões da role (eks:ListClusters).');
        });

        if (!clusters || clusters.length === 0) {
            return [];
        }

        const now = new Date();
        const mappedClusters: ReturnType<typeof mapAwsCluster>[] = [];

        for (const clusterName of clusters) {
            if (!clusterName) continue;

            const { cluster } = await eks.send(new DescribeClusterCommand({ name: clusterName })).catch(() => {
                throw new BadRequestException(`Falha ao descrever o cluster EKS "${clusterName}". Verifique as permissões da role (eks:DescribeCluster).`);
            });

            if (!cluster) {
                continue;
            }

            const clusterData = mapAwsCluster(cluster);
            mappedClusters.push(clusterData);

            const vpc = clusterData.awsVpcId
                ? await this.vpcRepository.findOne({
                      where: { cloudAccountId, awsVpcId: clusterData.awsVpcId },
                  })
                : null;

            if (clusterData.awsVpcId && !vpc) {
                console.warn(`VPC ${clusterData.awsVpcId} não encontrada no banco. Sincronize as VPCs primeiro.`);
            }

            const iamRole = clusterData.roleArn
                ? await this.iamRoleRepository.findOne({
                      where: { cloudAccountId, roleArn: clusterData.roleArn },
                  })
                : null;

            if (clusterData.roleArn && !iamRole) {
                console.warn(`IAM Role ${clusterData.roleArn} não encontrada no banco. Sincronize as IAM Roles primeiro.`);
            }

            const securityGroupIds = await this.resolveSecurityGroupIds(cloudAccountId, clusterData.awsSecurityGroupIds ?? []);
            const ec2InstanceIds = await this.resolveEc2InstanceIds(vpc?.id ?? null, securityGroupIds);

            let dbCluster = await this.eksRepository.findOne({
                where: { clusterArn: clusterData.clusterArn },
            });

            if (dbCluster) {
                dbCluster.clusterName = clusterData.clusterName;
                dbCluster.status = clusterData.status;
                dbCluster.version = clusterData.version;
                dbCluster.endpoint = clusterData.endpoint;
                dbCluster.roleArn = clusterData.roleArn;
                dbCluster.iamRoleId = iamRole?.id ?? null;
                dbCluster.awsVpcId = clusterData.awsVpcId;
                dbCluster.vpcId = vpc?.id ?? null;
                dbCluster.awsSecurityGroupIds = clusterData.awsSecurityGroupIds;
                dbCluster.securityGroupIds = securityGroupIds;
                dbCluster.ec2InstanceIds = ec2InstanceIds;
                dbCluster.endpointPublicAccess = clusterData.endpointPublicAccess;
                dbCluster.endpointPrivateAccess = clusterData.endpointPrivateAccess;
                dbCluster.publicAccessCidrs = clusterData.publicAccessCidrs;
                dbCluster.platformVersion = clusterData.platformVersion;
                dbCluster.logging = clusterData.logging;
                dbCluster.createdAtAws = clusterData.createdAtAws;
                dbCluster.tags = clusterData.tags;
                dbCluster.lastSyncedAt = now;
            } else {
                dbCluster = this.eksRepository.create({
                    cloudAccountId,
                    clusterArn: clusterData.clusterArn,
                    clusterName: clusterData.clusterName,
                    status: clusterData.status,
                    version: clusterData.version,
                    endpoint: clusterData.endpoint,
                    roleArn: clusterData.roleArn,
                    iamRoleId: iamRole?.id ?? null,
                    awsVpcId: clusterData.awsVpcId,
                    vpcId: vpc?.id ?? null,
                    awsSecurityGroupIds: clusterData.awsSecurityGroupIds,
                    securityGroupIds,
                    ec2InstanceIds,
                    endpointPublicAccess: clusterData.endpointPublicAccess,
                    endpointPrivateAccess: clusterData.endpointPrivateAccess,
                    publicAccessCidrs: clusterData.publicAccessCidrs,
                    platformVersion: clusterData.platformVersion,
                    logging: clusterData.logging,
                    createdAtAws: clusterData.createdAtAws,
                    tags: clusterData.tags,
                    lastSyncedAt: now,
                });
            }

            await this.eksRepository.save(dbCluster);
        }

        return mappedClusters;
    }

    private async resolveSecurityGroupIds(cloudAccountId: string, awsSecurityGroupIds: string[]): Promise<string[] | null> {
        if (awsSecurityGroupIds.length === 0) {
            return null;
        }

        const groups = await this.securityGroupRepository.find({
            where: {
                cloudAccountId,
                awsSecurityGroupId: In(awsSecurityGroupIds),
            },
        });

        if (groups.length !== awsSecurityGroupIds.length) {
            const foundAwsIds = new Set(groups.map((group) => group.awsSecurityGroupId));
            const missing = awsSecurityGroupIds.filter((id) => !foundAwsIds.has(id));
            if (missing.length > 0) {
                console.warn(`Security Groups não encontrados no banco: ${missing.join(', ')}. Sincronize os Security Groups primeiro.`);
            }
        }

        const ids = groups.map((group) => group.id);
        return ids.length > 0 ? ids : null;
    }

    private async resolveEc2InstanceIds(vpcId: string | null, securityGroupIds: string[] | null): Promise<string[] | null> {
        if (!vpcId) {
            return null;
        }

        const whereClause =
            securityGroupIds && securityGroupIds.length > 0
                ? {
                      vpcId,
                      securityGroupId: In(securityGroupIds),
                  }
                : {
                      vpcId,
                  };

        const instances = await this.ec2Repository.find({
            where: whereClause,
            select: {
                id: true,
            },
        });

        if (instances.length === 0) {
            return null;
        }

        return instances.map((instance) => instance.id);
    }
}

function mapAwsCluster(cluster: Cluster) {
    const vpcConfig = cluster.resourcesVpcConfig;
    const tags = parseTags(cluster.tags);

    return {
        clusterArn: cluster.arn ?? '',
        clusterName: cluster.name ?? '',
        status: cluster.status ?? 'PENDING',
        version: cluster.version ?? null,
        endpoint: cluster.endpoint ?? null,
        roleArn: cluster.roleArn ?? null,
        awsVpcId: vpcConfig?.vpcId ?? null,
        awsSecurityGroupIds: vpcConfig?.securityGroupIds ?? null,
        endpointPublicAccess: vpcConfig?.endpointPublicAccess ?? true,
        endpointPrivateAccess: vpcConfig?.endpointPrivateAccess ?? false,
        publicAccessCidrs: vpcConfig?.publicAccessCidrs ?? null,
        platformVersion: cluster.platformVersion ?? null,
        logging: cluster.logging ? JSON.parse(JSON.stringify(cluster.logging)) : null,
        createdAtAws: cluster.createdAt ?? null,
        tags,
    };
}

function parseTags(tags: Record<string, string> | undefined): Record<string, string> {
    if (!tags) return {};

    return Object.entries(tags).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value ?? '';
        return acc;
    }, {});
}

function mapDbCluster(cluster: AwsEksCluster) {
    return {
        id: cluster.id,
        cloudAccountId: cluster.cloudAccountId,
        clusterArn: cluster.clusterArn,
        clusterName: cluster.clusterName,
        status: cluster.status,
        version: cluster.version,
        endpoint: cluster.endpoint,
        roleArn: cluster.roleArn,
        iamRoleId: cluster.iamRoleId,
        awsVpcId: cluster.awsVpcId,
        vpcId: cluster.vpcId,
        awsSecurityGroupIds: cluster.awsSecurityGroupIds ?? [],
        securityGroupIds: cluster.securityGroupIds ?? [],
        ec2InstanceIds: cluster.ec2InstanceIds ?? [],
        endpointPublicAccess: cluster.endpointPublicAccess,
        endpointPrivateAccess: cluster.endpointPrivateAccess,
        publicAccessCidrs: cluster.publicAccessCidrs ?? [],
        platformVersion: cluster.platformVersion,
        logging: cluster.logging,
        createdAtAws: cluster.createdAtAws,
        tags: cluster.tags ?? {},
        lastSyncedAt: cluster.lastSyncedAt,
        createdAt: cluster.createdAt,
        updatedAt: cluster.updatedAt,
        vpc: cluster.vpc
            ? {
                  id: cluster.vpc.id,
                  awsVpcId: cluster.vpc.awsVpcId,
                  cidrBlock: cluster.vpc.cidrBlock,
                  state: cluster.vpc.state,
              }
            : null,
        iamRole: cluster.iamRole
            ? {
                  id: cluster.iamRole.id,
                  roleArn: cluster.iamRole.roleArn,
                  roleName: cluster.iamRole.roleName,
              }
            : null,
    };
}
