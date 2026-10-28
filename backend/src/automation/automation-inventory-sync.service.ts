import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcsService } from '../aws/ecs/aws-ecs.service';
import { AwsEcrService } from '../aws/ecr/aws-ecr.service';
import { AwsLoadBalancerService } from '../aws/load-balancers/aws-load-balancer.service';
import { AwsIamRoleService } from '../aws/iam/aws-iam-role.service';
import { AwsNetworkingService } from '../aws/networking/aws-networking.service';
import { AwsSecurityGroupService } from '../aws/security-groups/aws-security-group.service';
import { AwsSecretsManagerService } from '../aws/secrets-manager/aws-secrets-manager.service';
import { AwsEcsCluster } from '../db/entites/aws-ecs-cluster.entity';
import { AwsEcsService } from '../db/entites/aws-ecs-service.entity';
import { AwsEcsTaskDefinition } from '../db/entites/aws-ecs-task-definition.entity';
import { AwsEcrRepository } from '../db/entites/aws-ecr-repository.entity';
import { AwsLoadBalancer } from '../db/entites/aws-load-balancer.entity';
import { AwsIamRole } from '../db/entites/aws-iam-role.entity';
import { AwsSecurityGroup } from '../db/entites/aws-security-group.entity';
import { AwsSecretsManagerSecret } from '../db/entites/aws-secrets-manager-secret.entity';

const FAMILY_BY_TYPE: Record<string, string> = {
    'AWS::ECS::Cluster': 'ecs',
    'AWS::ECS::TaskDefinition': 'ecs',
    'AWS::ECS::Service': 'ecs',
    'AWS::ECR::Repository': 'ecr',
    'AWS::ElasticLoadBalancingV2::LoadBalancer': 'load_balancer',
    'AWS::ElasticLoadBalancingV2::TargetGroup': 'load_balancer',
    'AWS::ElasticLoadBalancingV2::Listener': 'load_balancer',
    'AWS::IAM::Role': 'iam',
    'AWS::IAM::Policy': 'iam',
    'AWS::EC2::VPC': 'networking',
    'AWS::EC2::Subnet': 'networking',
    'AWS::EC2::SecurityGroup': 'security_group',
    'AWS::SecretsManager::Secret': 'secrets',
};

@Injectable()
export class AutomationInventorySyncService {
    private readonly logger = new Logger(AutomationInventorySyncService.name);

    constructor(
        private readonly ecs: EcsService,
        private readonly ecr: AwsEcrService,
        private readonly loadBalancers: AwsLoadBalancerService,
        private readonly iam: AwsIamRoleService,
        private readonly networking: AwsNetworkingService,
        private readonly securityGroups: AwsSecurityGroupService,
        private readonly secrets: AwsSecretsManagerService,
        @Optional() @InjectRepository(AwsEcsCluster) private readonly clusters?: Repository<AwsEcsCluster>,
        @Optional() @InjectRepository(AwsEcsService) private readonly ecsServices?: Repository<AwsEcsService>,
        @Optional() @InjectRepository(AwsEcsTaskDefinition) private readonly taskDefinitions?: Repository<AwsEcsTaskDefinition>,
        @Optional() @InjectRepository(AwsEcrRepository) private readonly repositories?: Repository<AwsEcrRepository>,
        @Optional() @InjectRepository(AwsLoadBalancer) private readonly loadBalancerRows?: Repository<AwsLoadBalancer>,
        @Optional() @InjectRepository(AwsIamRole) private readonly roles?: Repository<AwsIamRole>,
        @Optional() @InjectRepository(AwsSecurityGroup) private readonly securityGroupRows?: Repository<AwsSecurityGroup>,
        @Optional() @InjectRepository(AwsSecretsManagerSecret) private readonly secretRows?: Repository<AwsSecretsManagerSecret>,
    ) {}

    familiesFor(resourceTypes: string[]): string[] {
        return [...new Set(resourceTypes.map((type) => FAMILY_BY_TYPE[type]).filter((family): family is string => Boolean(family)))];
    }

    async syncFamilies(cloudAccountId: string, organizationId: string, region: string, families: string[]): Promise<string[]> {
        const errors: string[] = [];
        for (const family of families) {
            try {
                await this.syncFamily(family, cloudAccountId, organizationId, region);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'inventory sync failed';
                errors.push(`${family}: ${message}`);
                this.logger.error(`automation.inventory.sync_failed family=${family} account=${cloudAccountId}`);
            }
        }
        return errors;
    }

    async syncStackResources(
        cloudAccountId: string,
        organizationId: string,
        region: string,
        resources: Array<{ type: string; physicalId: string | null }>,
    ): Promise<string[]> {
        const errors = await this.syncFamilies(cloudAccountId, organizationId, region, this.familiesFor(resources.map((resource) => resource.type)));
        for (const resource of resources) {
            if (!resource.physicalId) continue;
            const present = await this.resourceIsPresent(resource.type, resource.physicalId);
            if (present === false) errors.push(`${resource.type} ${resource.physicalId}`);
        }
        return errors;
    }

    private async resourceIsPresent(type: string, physicalId: string): Promise<boolean | null> {
        switch (type) {
            case 'AWS::ECS::Cluster':
                return this.clusters ? Boolean(await this.clusters.exist({ where: { clusterArn: physicalId } })) : null;
            case 'AWS::ECS::Service':
                return this.ecsServices ? Boolean(await this.ecsServices.exist({ where: { serviceArn: physicalId } })) : null;
            case 'AWS::ECS::TaskDefinition':
                return this.taskDefinitions ? Boolean(await this.taskDefinitions.exist({ where: { taskDefinitionArn: physicalId } })) : null;
            case 'AWS::ECR::Repository':
                return this.repositories ? Boolean(await this.repositories.exist({ where: { repositoryArn: physicalId } })) : null;
            case 'AWS::ElasticLoadBalancingV2::LoadBalancer':
                return this.loadBalancerRows ? Boolean(await this.loadBalancerRows.exist({ where: { awsLoadBalancerArn: physicalId } })) : null;
            case 'AWS::IAM::Role':
                return this.roles ? Boolean(await this.roles.exist({ where: [{ roleArn: physicalId }, { roleName: physicalId }] })) : null;
            case 'AWS::EC2::SecurityGroup':
                return this.securityGroupRows ? Boolean(await this.securityGroupRows.exist({ where: { awsSecurityGroupId: physicalId } })) : null;
            case 'AWS::SecretsManager::Secret':
                return this.secretRows ? Boolean(await this.secretRows.exist({ where: { secretArn: physicalId } })) : null;
            default:
                return null;
        }
    }

    private async syncFamily(family: string, cloudAccountId: string, organizationId: string, region: string): Promise<void> {
        switch (family) {
            case 'ecs':
                await this.ecs.syncClustersFromAws(cloudAccountId, organizationId, region);
                await this.ecs.syncTaskDefinitionsFromAws(cloudAccountId, organizationId, undefined, region);
                await this.ecs.syncServicesFromAws(cloudAccountId, organizationId, undefined, region);
                return;
            case 'ecr':
                await this.ecr.syncRepositoriesFromAws(cloudAccountId, organizationId);
                return;
            case 'load_balancer':
                await this.loadBalancers.syncLoadBalancersFromAws(cloudAccountId, organizationId, region);
                return;
            case 'iam':
                await this.iam.syncRolesFromAws(cloudAccountId, organizationId, undefined, 'all');
                return;
            case 'networking':
                await this.networking.syncVpcsFromAws(cloudAccountId, organizationId);
                await this.networking.syncSubnetsFromAws(cloudAccountId, organizationId);
                return;
            case 'security_group':
                await this.securityGroups.syncSecurityGroupsFromAws(cloudAccountId, organizationId);
                return;
            case 'secrets':
                await this.secrets.syncSecretsFromAws(cloudAccountId, organizationId);
                return;
            default:
                return;
        }
    }
}
