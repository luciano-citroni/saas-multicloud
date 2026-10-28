import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DescribeSubnetsCommand, DescribeSecurityGroupsCommand, DescribeVpcsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr';
import { DescribeClustersCommand, ECSClient, ListClustersCommand } from '@aws-sdk/client-ecs';
import { GetRoleCommand, IAMClient } from '@aws-sdk/client-iam';
import { DescribeLoadBalancersCommand, ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { DescribeSecretCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AwsConnectorService } from '../aws/aws-connector.service';
import { ErrorMessages } from '../common/messages/error-messages';
import {
    AwsEcrRepository,
    AwsEcsCluster,
    AwsIamRole,
    AwsLoadBalancer,
    AwsSecretsManagerSecret,
    AwsSecurityGroup,
    AwsSubnet,
    AwsVpc,
} from '../db/entites';

export interface ExistingResourceItem {
    id: string;
    name: string;
    source: 'assessment' | 'aws';
    detail?: string;
    vpcId?: string;
    region?: string | null;
}

@Injectable()
export class ExistingResourceService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsVpc) private readonly vpcs: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet) private readonly subnets: Repository<AwsSubnet>,
        @InjectRepository(AwsSecurityGroup) private readonly securityGroups: Repository<AwsSecurityGroup>,
        @InjectRepository(AwsEcrRepository) private readonly repositories: Repository<AwsEcrRepository>,
        @InjectRepository(AwsEcsCluster) private readonly clusters: Repository<AwsEcsCluster>,
        @InjectRepository(AwsIamRole) private readonly roles: Repository<AwsIamRole>,
        @InjectRepository(AwsSecretsManagerSecret) private readonly secrets: Repository<AwsSecretsManagerSecret>,
        @InjectRepository(AwsLoadBalancer) private readonly loadBalancers: Repository<AwsLoadBalancer>,
    ) {}

    async list(cloudAccountId: string, organizationId: string, region: string, resourceType: string): Promise<ExistingResourceItem[]> {
        const captured = await this.listAssessment(cloudAccountId, resourceType, region);
        if (captured.length > 0) return captured;
        return this.listLive(cloudAccountId, organizationId, region, resourceType);
    }

    async verify(
        cloudAccountId: string,
        organizationId: string,
        resourceType: string,
        region: string,
        resourceId: string,
    ): Promise<Record<string, unknown>> {
        const captured = await this.readAssessment(cloudAccountId, resourceType, resourceId);
        if (captured) return captured;

        switch (resourceType) {
            case 'vpc':
                return this.verifyVpc(cloudAccountId, organizationId, region, resourceId);
            case 'subnet':
                return this.verifySubnet(cloudAccountId, organizationId, region, resourceId);
            case 'security_group':
                return this.verifySecurityGroup(cloudAccountId, organizationId, region, resourceId);
            case 'ecr_repository':
                return this.verifyRepository(cloudAccountId, organizationId, region, resourceId);
            case 'ecs_cluster':
                return this.verifyCluster(cloudAccountId, organizationId, region, resourceId);
            case 'iam_role':
                return this.verifyRole(cloudAccountId, organizationId, resourceId);
            case 'secret':
                return this.verifySecret(cloudAccountId, organizationId, region, resourceId);
            case 'load_balancer':
                return this.verifyLoadBalancer(cloudAccountId, organizationId, region, resourceId);
            default:
                throw new BadRequestException(ErrorMessages.AUTOMATION.UNSUPPORTED_RESOURCE_TYPE);
        }
    }

    private async listAssessment(cloudAccountId: string, resourceType: string, region: string): Promise<ExistingResourceItem[]> {
        switch (resourceType) {
            case 'vpc': {
                const rows = await this.vpcs.find({ where: { cloudAccountId } });
                const subnetRows = rows.length ? await this.subnets.find({ where: { vpcId: In(rows.map((vpc) => vpc.id)) } }) : [];
                const regionByVpc = new Map<string, string>();
                for (const subnet of subnetRows) {
                    const subnetRegion = this.regionFromAz(subnet.availabilityZone);
                    if (subnetRegion && !regionByVpc.has(subnet.awsVpcId)) regionByVpc.set(subnet.awsVpcId, subnetRegion);
                }
                return this.keepRegion(rows.map((item) => ({
                    id: item.awsVpcId,
                    name: this.tagName(item.tags, item.awsVpcId),
                    source: 'assessment' as const,
                    detail: item.cidrBlock,
                    vpcId: item.awsVpcId,
                    region: regionByVpc.get(item.awsVpcId) ?? null,
                })), region);
            }
            case 'subnet': {
                const accountVpcs = await this.vpcs.find({ where: { cloudAccountId } });
                if (accountVpcs.length === 0) return [];
                const rows = await this.subnets.find({ where: { vpcId: In(accountVpcs.map((vpc) => vpc.id)) } });
                return this.keepRegion(rows.map((item) => ({
                    id: item.awsSubnetId,
                    name: this.tagName(item.tags, item.awsSubnetId),
                    source: 'assessment' as const,
                    detail: `${item.availabilityZone} · ${item.cidrBlock}`,
                    vpcId: item.awsVpcId,
                    region: this.regionFromAz(item.availabilityZone),
                })), region);
            }
            case 'security_group':
                return (await this.securityGroups.find({ where: { cloudAccountId } })).map((item) => ({
                    id: item.awsSecurityGroupId,
                    name: item.name,
                    source: 'assessment' as const,
                    detail: item.awsVpcId ?? undefined,
                    vpcId: item.awsVpcId ?? undefined,
                }));
            case 'ecr_repository':
                return this.keepRegion((await this.repositories.find({ where: { cloudAccountId } })).map((item) => ({
                    id: item.repositoryArn,
                    name: item.repositoryName,
                    source: 'assessment' as const,
                    detail: item.repositoryUri ?? undefined,
                    region: this.regionFromArn(item.repositoryArn),
                })), region);
            case 'ecs_cluster':
                return this.keepRegion((await this.clusters.find({ where: { cloudAccountId } })).map((item) => ({
                    id: item.clusterArn,
                    name: item.clusterName,
                    source: 'assessment' as const,
                    region: this.regionFromArn(item.clusterArn),
                })), region);
            case 'iam_role':
                return (await this.roles.find({ where: { cloudAccountId } })).map((item) => ({
                    id: item.roleArn,
                    name: item.roleName,
                    source: 'assessment' as const,
                }));
            case 'secret':
                return this.keepRegion((await this.secrets.find({ where: { cloudAccountId } })).map((item) => ({
                    id: item.secretArn,
                    name: item.name,
                    source: 'assessment' as const,
                    region: this.regionFromArn(item.secretArn),
                })), region);
            case 'load_balancer':
                return this.keepRegion((await this.loadBalancers.find({ where: { cloudAccountId } })).map((item) => ({
                    id: item.awsLoadBalancerArn,
                    name: item.name,
                    source: 'assessment' as const,
                    detail: item.dnsName,
                    region: this.regionFromArn(item.awsLoadBalancerArn),
                })), region);
            default:
                return [];
        }
    }

    private async readAssessment(cloudAccountId: string, resourceType: string, resourceId: string): Promise<Record<string, unknown> | null> {
        switch (resourceType) {
            case 'vpc': {
                const row = await this.vpcs.findOne({ where: { cloudAccountId, awsVpcId: resourceId } });
                return row ? { vpcId: row.awsVpcId, cidr: row.cidrBlock, name: this.tagName(row.tags, row.awsVpcId) } : null;
            }
            case 'subnet': {
                const accountVpcs = await this.vpcs.find({ where: { cloudAccountId }, select: { id: true } });
                if (!accountVpcs.length) return null;
                const row = await this.subnets.findOne({ where: { awsSubnetId: resourceId, vpcId: In(accountVpcs.map((vpc) => vpc.id)) } });
                return row ? { subnetId: row.awsSubnetId, vpcId: row.awsVpcId, availabilityZone: row.availabilityZone, cidr: row.cidrBlock } : null;
            }
            case 'security_group': {
                const row = await this.securityGroups.findOne({ where: { cloudAccountId, awsSecurityGroupId: resourceId } });
                return row ? { groupId: row.awsSecurityGroupId, vpcId: row.awsVpcId ?? '', name: row.name } : null;
            }
            case 'ecr_repository': {
                const row = await this.repositories.findOne({
                    where: [{ cloudAccountId, repositoryArn: resourceId }, { cloudAccountId, repositoryName: resourceId }, { cloudAccountId, repositoryUri: resourceId }],
                });
                return row ? { repositoryArn: row.repositoryArn, repositoryUri: row.repositoryUri ?? '', repositoryName: row.repositoryName } : null;
            }
            case 'ecs_cluster': {
                const row = await this.clusters.findOne({ where: [{ cloudAccountId, clusterArn: resourceId }, { cloudAccountId, clusterName: resourceId }] });
                return row ? { clusterArn: row.clusterArn, clusterName: row.clusterName } : null;
            }
            case 'iam_role': {
                const row = await this.roles.findOne({ where: [{ cloudAccountId, roleArn: resourceId }, { cloudAccountId, roleName: resourceId }] });
                return row ? { roleArn: row.roleArn, roleName: row.roleName } : null;
            }
            case 'secret': {
                const row = await this.secrets.findOne({ where: { cloudAccountId, secretArn: resourceId } });
                return row ? { secretArn: row.secretArn, secretName: row.name } : null;
            }
            case 'load_balancer': {
                const row = await this.loadBalancers.findOne({ where: { cloudAccountId, awsLoadBalancerArn: resourceId } });
                return row ? { loadBalancerArn: row.awsLoadBalancerArn, dnsName: row.dnsName ?? '', name: row.name } : null;
            }
            default:
                return null;
        }
    }

    private tagName(tags: Record<string, string> | null | undefined, fallback: string): string {
        return tags?.Name || tags?.name || fallback;
    }

    private regionFromAz(availabilityZone: string | null | undefined): string | null {
        if (!availabilityZone) return null;
        return availabilityZone.slice(0, -1);
    }

    private regionFromArn(arn: string | null | undefined): string | null {
        if (!arn?.startsWith('arn:')) return null;
        const region = arn.split(':')[3];
        return region || null;
    }

    private keepRegion(items: ExistingResourceItem[], region: string): ExistingResourceItem[] {
        if (!region) return items;
        const matched = items.filter((item) => !item.region || item.region === region);
        return matched.length > 0 ? matched : items;
    }

    private async listLive(cloudAccountId: string, organizationId: string, region: string, resourceType: string): Promise<ExistingResourceItem[]> {
        if (resourceType === 'vpc') {
            const client = await this.ec2(cloudAccountId, organizationId, region);
            const { Vpcs = [] } = await client.send(new DescribeVpcsCommand({}));
            return Vpcs.filter((item) => item.VpcId).map((item) => ({
                id: item.VpcId!,
                name: item.Tags?.find((tag) => tag.Key === 'Name')?.Value ?? item.VpcId!,
                source: 'aws' as const,
                detail: item.CidrBlock,
            }));
        }
        if (resourceType === 'subnet') {
            const client = await this.ec2(cloudAccountId, organizationId, region);
            const { Subnets = [] } = await client.send(new DescribeSubnetsCommand({}));
            return Subnets.filter((item) => item.SubnetId).map((item) => ({
                id: item.SubnetId!,
                name: item.Tags?.find((tag) => tag.Key === 'Name')?.Value ?? item.SubnetId!,
                source: 'aws' as const,
                detail: item.AvailabilityZone,
            }));
        }
        if (resourceType === 'security_group') {
            const client = await this.ec2(cloudAccountId, organizationId, region);
            const { SecurityGroups = [] } = await client.send(new DescribeSecurityGroupsCommand({}));
            return SecurityGroups.filter((item) => item.GroupId).map((item) => ({
                id: item.GroupId!,
                name: item.GroupName ?? item.GroupId!,
                source: 'aws' as const,
                detail: item.VpcId,
            }));
        }
        if (resourceType === 'ecr_repository') {
            const client = await this.ecr(cloudAccountId, organizationId, region);
            const { repositories = [] } = await client.send(new DescribeRepositoriesCommand({}));
            return repositories.filter((item) => item.repositoryArn).map((item) => ({
                id: item.repositoryArn!,
                name: item.repositoryName ?? item.repositoryArn!,
                source: 'aws' as const,
                detail: item.repositoryUri,
            }));
        }
        if (resourceType === 'ecs_cluster') {
            const client = await this.ecs(cloudAccountId, organizationId, region);
            const { clusterArns = [] } = await client.send(new ListClustersCommand({}));
            return clusterArns.map((arn) => ({ id: arn, name: arn.split('/').pop() ?? arn, source: 'aws' as const }));
        }
        if (resourceType === 'load_balancer') {
            const client = await this.elb(cloudAccountId, organizationId, region);
            const { LoadBalancers = [] } = await client.send(new DescribeLoadBalancersCommand({}));
            return LoadBalancers.filter((item) => item.LoadBalancerArn).map((item) => ({
                id: item.LoadBalancerArn!,
                name: item.LoadBalancerName ?? item.LoadBalancerArn!,
                source: 'aws' as const,
                detail: item.DNSName,
            }));
        }
        return [];
    }

    private async verifyVpc(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.ec2(cloudAccountId, organizationId, region);
        const { Vpcs = [] } = await client.send(new DescribeVpcsCommand({ VpcIds: [resourceId] }));
        const vpc = Vpcs[0];
        if (!vpc?.VpcId) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { vpcId: vpc.VpcId, cidr: vpc.CidrBlock ?? '', name: vpc.Tags?.find((tag) => tag.Key === 'Name')?.Value ?? vpc.VpcId };
    }

    private async verifySubnet(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.ec2(cloudAccountId, organizationId, region);
        const { Subnets = [] } = await client.send(new DescribeSubnetsCommand({ SubnetIds: [resourceId] }));
        const subnet = Subnets[0];
        if (!subnet?.SubnetId) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { subnetId: subnet.SubnetId, vpcId: subnet.VpcId ?? '', availabilityZone: subnet.AvailabilityZone ?? '', cidr: subnet.CidrBlock ?? '' };
    }

    private async verifySecurityGroup(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.ec2(cloudAccountId, organizationId, region);
        const { SecurityGroups = [] } = await client.send(new DescribeSecurityGroupsCommand({ GroupIds: [resourceId] }));
        const group = SecurityGroups[0];
        if (!group?.GroupId) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { groupId: group.GroupId, vpcId: group.VpcId ?? '', name: group.GroupName ?? group.GroupId };
    }

    private async verifyRepository(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.ecr(cloudAccountId, organizationId, region);
        const name = resourceId.includes('/') ? resourceId.split('/').pop() : resourceId;
        const { repositories = [] } = await client.send(new DescribeRepositoriesCommand({ repositoryNames: [name!] }));
        const repository = repositories[0];
        if (!repository?.repositoryArn) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { repositoryArn: repository.repositoryArn, repositoryUri: repository.repositoryUri ?? '', repositoryName: repository.repositoryName ?? '' };
    }

    private async verifyCluster(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.ecs(cloudAccountId, organizationId, region);
        const { clusters = [] } = await client.send(new DescribeClustersCommand({ clusters: [resourceId] }));
        const cluster = clusters[0];
        if (!cluster?.clusterArn || cluster.status === 'INACTIVE') throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { clusterArn: cluster.clusterArn, clusterName: cluster.clusterName ?? '' };
    }

    private async verifyRole(cloudAccountId: string, organizationId: string, resourceId: string) {
        const client = await this.iam(cloudAccountId, organizationId);
        const roleName = resourceId.startsWith('arn:') ? resourceId.split('/').pop() : resourceId;
        const { Role } = await client.send(new GetRoleCommand({ RoleName: roleName }));
        if (!Role?.Arn) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { roleArn: Role.Arn, roleName: Role.RoleName ?? roleName ?? '' };
    }

    private async verifySecret(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.secretsClient(cloudAccountId, organizationId, region);
        const described = await client.send(new DescribeSecretCommand({ SecretId: resourceId }));
        if (!described.ARN) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { secretArn: described.ARN, secretName: described.Name ?? '' };
    }

    private async verifyLoadBalancer(cloudAccountId: string, organizationId: string, region: string, resourceId: string) {
        const client = await this.elb(cloudAccountId, organizationId, region);
        const { LoadBalancers = [] } = await client.send(new DescribeLoadBalancersCommand({ LoadBalancerArns: [resourceId] }));
        const balancer = LoadBalancers[0];
        if (!balancer?.LoadBalancerArn) throw new NotFoundException(ErrorMessages.AUTOMATION.RESOURCE_NOT_FOUND);
        return { loadBalancerArn: balancer.LoadBalancerArn, dnsName: balancer.DNSName ?? '', name: balancer.LoadBalancerName ?? '' };
    }

    private async ec2(cloudAccountId: string, organizationId: string, region: string): Promise<EC2Client> {
        return this.connector.getEc2Client(cloudAccountId, organizationId, region);
    }

    private async ecr(cloudAccountId: string, organizationId: string, region: string): Promise<ECRClient> {
        const creds = await this.connector.resolveRoleCredentials(cloudAccountId, organizationId);
        const temporary = await this.connector.assumeRole({ ...creds, region });
        return new ECRClient({ region, credentials: temporary });
    }

    private async ecs(cloudAccountId: string, organizationId: string, region: string): Promise<ECSClient> {
        return this.connector.getEcsClient(cloudAccountId, organizationId, region);
    }

    private async iam(cloudAccountId: string, organizationId: string): Promise<IAMClient> {
        const creds = await this.connector.resolveRoleCredentials(cloudAccountId, organizationId);
        const temporary = await this.connector.assumeRole(creds);
        return new IAMClient({ region: creds.region, credentials: temporary });
    }

    private async elb(cloudAccountId: string, organizationId: string, region: string): Promise<ElasticLoadBalancingV2Client> {
        const creds = await this.connector.resolveRoleCredentials(cloudAccountId, organizationId);
        const temporary = await this.connector.assumeRole({ ...creds, region });
        return new ElasticLoadBalancingV2Client({ region, credentials: temporary });
    }

    private async secretsClient(cloudAccountId: string, organizationId: string, region: string): Promise<SecretsManagerClient> {
        const creds = await this.connector.resolveRoleCredentials(cloudAccountId, organizationId);
        const temporary = await this.connector.assumeRole({ ...creds, region });
        return new SecretsManagerClient({ region, credentials: temporary });
    }
}
