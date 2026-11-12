import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

// AWS entities
import { AwsVpc } from '../../db/entites/aws-vpc.entity';
import { AwsEc2Instance } from '../../db/entites/aws-ec2.entity';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';
import { AwsSecurityGroup } from '../../db/entites/aws-security-group.entity';
import { AwsCloudTrailTrail } from '../../db/entites/aws-cloudtrail-trail.entity';
import { AwsRdsInstance } from '../../db/entites/aws-rds-instance.entity';
import { AwsKmsKey } from '../../db/entites/aws-kms-key.entity';
import { AwsGuardDutyDetector } from '../../db/entites/aws-guardduty-detector.entity';
import { AwsEksCluster } from '../../db/entites/aws-eks-cluster.entity';
import { AwsIamRole } from '../../db/entites/aws-iam-role.entity';
import { AwsLambdaFunction } from '../../db/entites/aws-lambda-function.entity';
import { AwsDynamoDbTable } from '../../db/entites/aws-dynamodb-table.entity';
import { AwsSqsQueue } from '../../db/entites/aws-sqs-queue.entity';
import { AwsSnsTopic } from '../../db/entites/aws-sns-topic.entity';
import { AwsLoadBalancer } from '../../db/entites/aws-load-balancer.entity';
import { AwsEcsCluster } from '../../db/entites/aws-ecs-cluster.entity';
import { AwsEcrRepository } from '../../db/entites/aws-ecr-repository.entity';
import { AwsSecretsManagerSecret } from '../../db/entites/aws-secrets-manager-secret.entity';
import { AwsElastiCacheCluster } from '../../db/entites/aws-elasticache-cluster.entity';
import { AwsApiGatewayRestApi } from '../../db/entites/aws-api-gateway-rest-api.entity';
import { AwsCloudFrontDistribution } from '../../db/entites/aws-cloudfront-distribution.entity';
import { AwsWafWebAcl } from '../../db/entites/aws-waf-web-acl.entity';
import { AwsRoute53HostedZone } from '../../db/entites/aws-route53-hosted-zone.entity';
import { AwsSubnet } from '../../db/entites/aws-subnet.entity';
import { AwsRouteTable } from '../../db/entites/aws-route-table.entity';
import { AwsEcsService } from '../../db/entites/aws-ecs-service.entity';
import { AwsEcsTaskDefinition } from '../../db/entites/aws-ecs-task-definition.entity';

// GCP entities
import { GcpStorageBucket } from '../../db/entites/gcp-storage-bucket.entity';
import { GcpFirewallRule } from '../../db/entites/gcp-firewall-rule.entity';
import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';
import { GcpSqlInstance } from '../../db/entites/gcp-sql-instance.entity';
import { GcpGkeCluster } from '../../db/entites/gcp-gke-cluster.entity';
import { GcpCloudRunService } from '../../db/entites/gcp-cloud-run-service.entity';
import { GcpCloudRunJob } from '../../db/entites/gcp-cloud-run-job.entity';

// Azure entities
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureStorageAccount } from '../../db/entites/azure-storage-account.entity';
import { AzureSqlDatabase } from '../../db/entites/azure-sql-database.entity';
import { AzureWebApp } from '../../db/entites/azure-web-app.entity';
import { AzureNsg } from '../../db/entites/azure-nsg.entity';
import { AzureKeyVault } from '../../db/entites/azure-key-vault.entity';
import { AzureAksCluster } from '../../db/entites/azure-aks-cluster.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';
import { AzureVirtualNetwork } from '../../db/entites/azure-virtual-network.entity';
import { AzureLoadBalancer } from '../../db/entites/azure-load-balancer.entity';
import { AzureCosmosDb } from '../../db/entites/azure-cosmos-db.entity';
import { AzurePostgresServer } from '../../db/entites/azure-postgres-server.entity';
import { AzureSqlServer } from '../../db/entites/azure-sql-server.entity';
import { AzureAppServicePlan } from '../../db/entites/azure-app-service-plan.entity';
import { AzureResourceGroup } from '../../db/entites/azure-resource-group.entity';
import { AzureApplicationGateway } from '../../db/entites/azure-application-gateway.entity';
import { AzurePublicIp } from '../../db/entites/azure-public-ip.entity';
import { AzureNetworkInterface } from '../../db/entites/azure-network-interface.entity';
import { AzureVmss } from '../../db/entites/azure-vmss.entity';
import { AzureRecoveryVault } from '../../db/entites/azure-recovery-vault.entity';

import { GovernanceFinding, FindingSeverity, FindingStatus } from '../../db/entites/governance-finding.entity';
import { GovernanceSuppression } from '../../db/entites/governance-suppression.entity';

import { PolicyRegistryService } from '../policies/policy-registry.service';
import { PolicyContext, PolicyEvaluationResult } from '../policies/policy.interface';
import { evaluateOrgKnowledgeTags } from '../policies/org-knowledge-tags.evaluator';
import { GOVERNANCE_FINDINGS_BATCH_SIZE } from '../constants';

// ── Resource container interfaces ────────────────────────────────────────────

export interface AwsScanResources {
    vpcs: AwsVpc[];
    s3Buckets: AwsS3Bucket[];
    securityGroups: AwsSecurityGroup[];
    ec2Instances: AwsEc2Instance[];
    cloudTrailTrails: AwsCloudTrailTrail[];
    rdsInstances: AwsRdsInstance[];
    kmsKeys: AwsKmsKey[];
    guardDutyDetectors: AwsGuardDutyDetector[];
    eksClusters: AwsEksCluster[];
    iamRoles: AwsIamRole[];
    lambdaFunctions: AwsLambdaFunction[];
    dynamoTables: AwsDynamoDbTable[];
    sqsQueues: AwsSqsQueue[];
    snsTopics: AwsSnsTopic[];
    loadBalancers: AwsLoadBalancer[];
    ecsClusters: AwsEcsCluster[];
    ecrRepositories: AwsEcrRepository[];
    secrets: AwsSecretsManagerSecret[];
    elasticacheClusters: AwsElastiCacheCluster[];
    apiGateways: AwsApiGatewayRestApi[];
    cloudFrontDistributions: AwsCloudFrontDistribution[];
    wafWebAcls: AwsWafWebAcl[];
    route53Zones: AwsRoute53HostedZone[];
    subnets: AwsSubnet[];
    routeTables: AwsRouteTable[];
    ecsServices: AwsEcsService[];
    ecsTaskDefinitions: AwsEcsTaskDefinition[];
}

export interface GcpScanResources {
    storageBuckets: GcpStorageBucket[];
    firewallRules: GcpFirewallRule[];
    vmInstances: GcpVmInstance[];
    sqlInstances: GcpSqlInstance[];
    gkeClusters: GcpGkeCluster[];
    cloudRunServices: GcpCloudRunService[];
    cloudRunJobs: GcpCloudRunJob[];
}

export interface AzureScanResources {
    virtualMachines: AzureVirtualMachine[];
    storageAccounts: AzureStorageAccount[];
    sqlDatabases: AzureSqlDatabase[];
    webApps: AzureWebApp[];
    nsgs: AzureNsg[];
    keyVaults: AzureKeyVault[];
    aksClusters: AzureAksCluster[];
    disks: AzureDisk[];
    virtualNetworks: AzureVirtualNetwork[];
    loadBalancers: AzureLoadBalancer[];
    cosmosAccounts: AzureCosmosDb[];
    postgresServers: AzurePostgresServer[];
    sqlServers: AzureSqlServer[];
    appServicePlans: AzureAppServicePlan[];
    resourceGroups: AzureResourceGroup[];
    applicationGateways: AzureApplicationGateway[];
    publicIps: AzurePublicIp[];
    networkInterfaces: AzureNetworkInterface[];
    vmss: AzureVmss[];
    recoveryVaults: AzureRecoveryVault[];
}

/**
 * @deprecated Use AwsScanResources directly. Kept for backwards compatibility.
 */
export type ScanResources = AwsScanResources;

export interface ScanEvaluationResult {
    findings: Array<
        PolicyEvaluationResult & {
            policyId: string;
            policyName: string;
            severity: FindingSeverity;
            category: string | null;
        }
    >;
    score: number;
    totalChecks: number;
    totalNonCompliant: number;
    totalSuppressed: number;
}

/** Pesos por severidade usados no cálculo do score de governança. */
const SEVERITY_WEIGHTS: Record<FindingSeverity, number> = {
    critical: 40,
    high: 20,
    medium: 10,
    low: 5,
};

function isOrgTagPolicyId(policyId: string): boolean {
    return policyId.includes('required-tags') || policyId.includes('required-labels');
}

@Injectable()
export class GovernanceScanService {
    private readonly logger = new Logger(GovernanceScanService.name);

    constructor(
        // ── AWS repos ─────────────────────────────────────────────────────
        @InjectRepository(AwsVpc)
        private readonly vpcRepo: Repository<AwsVpc>,

        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repo: Repository<AwsEc2Instance>,

        @InjectRepository(AwsS3Bucket)
        private readonly s3Repo: Repository<AwsS3Bucket>,

        @InjectRepository(AwsSecurityGroup)
        private readonly sgRepo: Repository<AwsSecurityGroup>,

        @InjectRepository(AwsCloudTrailTrail)
        private readonly cloudTrailRepo: Repository<AwsCloudTrailTrail>,

        @InjectRepository(AwsRdsInstance)
        private readonly rdsRepo: Repository<AwsRdsInstance>,

        @InjectRepository(AwsKmsKey)
        private readonly kmsRepo: Repository<AwsKmsKey>,

        @InjectRepository(AwsGuardDutyDetector)
        private readonly guardDutyRepo: Repository<AwsGuardDutyDetector>,

        @InjectRepository(AwsEksCluster)
        private readonly eksRepo: Repository<AwsEksCluster>,

        @InjectRepository(AwsIamRole)
        private readonly iamRoleRepo: Repository<AwsIamRole>,

        @InjectRepository(AwsLambdaFunction)
        private readonly lambdaRepo: Repository<AwsLambdaFunction>,

        @InjectRepository(AwsDynamoDbTable)
        private readonly dynamoRepo: Repository<AwsDynamoDbTable>,

        @InjectRepository(AwsSqsQueue)
        private readonly sqsRepo: Repository<AwsSqsQueue>,

        @InjectRepository(AwsSnsTopic)
        private readonly snsRepo: Repository<AwsSnsTopic>,

        @InjectRepository(AwsLoadBalancer)
        private readonly elbRepo: Repository<AwsLoadBalancer>,

        @InjectRepository(AwsEcsCluster)
        private readonly ecsRepo: Repository<AwsEcsCluster>,

        @InjectRepository(AwsEcrRepository)
        private readonly ecrRepo: Repository<AwsEcrRepository>,

        @InjectRepository(AwsSecretsManagerSecret)
        private readonly secretsRepo: Repository<AwsSecretsManagerSecret>,

        @InjectRepository(AwsElastiCacheCluster)
        private readonly elasticacheRepo: Repository<AwsElastiCacheCluster>,

        @InjectRepository(AwsApiGatewayRestApi)
        private readonly apiGatewayRepo: Repository<AwsApiGatewayRestApi>,

        @InjectRepository(AwsCloudFrontDistribution)
        private readonly cloudFrontRepo: Repository<AwsCloudFrontDistribution>,

        @InjectRepository(AwsWafWebAcl)
        private readonly wafRepo: Repository<AwsWafWebAcl>,

        @InjectRepository(AwsRoute53HostedZone)
        private readonly route53Repo: Repository<AwsRoute53HostedZone>,

        @InjectRepository(AwsSubnet)
        private readonly subnetRepo: Repository<AwsSubnet>,

        @InjectRepository(AwsRouteTable)
        private readonly routeTableRepo: Repository<AwsRouteTable>,

        @InjectRepository(AwsEcsService)
        private readonly ecsServiceRepo: Repository<AwsEcsService>,

        @InjectRepository(AwsEcsTaskDefinition)
        private readonly ecsTaskDefRepo: Repository<AwsEcsTaskDefinition>,

        // ── GCP repos ─────────────────────────────────────────────────────
        @InjectRepository(GcpStorageBucket)
        private readonly gcpStorageBucketRepo: Repository<GcpStorageBucket>,

        @InjectRepository(GcpFirewallRule)
        private readonly gcpFirewallRuleRepo: Repository<GcpFirewallRule>,

        @InjectRepository(GcpVmInstance)
        private readonly gcpVmInstanceRepo: Repository<GcpVmInstance>,

        @InjectRepository(GcpSqlInstance)
        private readonly gcpSqlInstanceRepo: Repository<GcpSqlInstance>,

        @InjectRepository(GcpGkeCluster)
        private readonly gcpGkeClusterRepo: Repository<GcpGkeCluster>,

        @InjectRepository(GcpCloudRunService)
        private readonly gcpCloudRunServiceRepo: Repository<GcpCloudRunService>,

        @InjectRepository(GcpCloudRunJob)
        private readonly gcpCloudRunJobRepo: Repository<GcpCloudRunJob>,

        // ── Azure repos ───────────────────────────────────────────────────
        @InjectRepository(AzureVirtualMachine)
        private readonly azureVmRepo: Repository<AzureVirtualMachine>,

        @InjectRepository(AzureStorageAccount)
        private readonly azureStorageRepo: Repository<AzureStorageAccount>,

        @InjectRepository(AzureSqlDatabase)
        private readonly azureSqlDbRepo: Repository<AzureSqlDatabase>,

        @InjectRepository(AzureWebApp)
        private readonly azureWebAppRepo: Repository<AzureWebApp>,

        @InjectRepository(AzureNsg)
        private readonly azureNsgRepo: Repository<AzureNsg>,

        @InjectRepository(AzureKeyVault)
        private readonly azureKeyVaultRepo: Repository<AzureKeyVault>,

        @InjectRepository(AzureAksCluster)
        private readonly azureAksRepo: Repository<AzureAksCluster>,

        @InjectRepository(AzureDisk)
        private readonly azureDiskRepo: Repository<AzureDisk>,

        @InjectRepository(AzureVirtualNetwork)
        private readonly azureVnetRepo: Repository<AzureVirtualNetwork>,

        @InjectRepository(AzureLoadBalancer)
        private readonly azureLbRepo: Repository<AzureLoadBalancer>,

        @InjectRepository(AzureCosmosDb)
        private readonly azureCosmosRepo: Repository<AzureCosmosDb>,

        @InjectRepository(AzurePostgresServer)
        private readonly azurePostgresRepo: Repository<AzurePostgresServer>,

        @InjectRepository(AzureSqlServer)
        private readonly azureSqlServerRepo: Repository<AzureSqlServer>,

        @InjectRepository(AzureAppServicePlan)
        private readonly azureAspRepo: Repository<AzureAppServicePlan>,

        @InjectRepository(AzureResourceGroup)
        private readonly azureRgRepo: Repository<AzureResourceGroup>,

        @InjectRepository(AzureApplicationGateway)
        private readonly azureAppGwRepo: Repository<AzureApplicationGateway>,

        @InjectRepository(AzurePublicIp)
        private readonly azurePipRepo: Repository<AzurePublicIp>,

        @InjectRepository(AzureNetworkInterface)
        private readonly azureNicRepo: Repository<AzureNetworkInterface>,

        @InjectRepository(AzureVmss)
        private readonly azureVmssRepo: Repository<AzureVmss>,

        @InjectRepository(AzureRecoveryVault)
        private readonly azureRecoveryVaultRepo: Repository<AzureRecoveryVault>,

        // ── Shared ────────────────────────────────────────────────────────
        @InjectRepository(GovernanceFinding)
        private readonly findingRepo: Repository<GovernanceFinding>,

        @InjectRepository(GovernanceSuppression)
        private readonly suppressionRepo: Repository<GovernanceSuppression>,

        private readonly policyRegistry: PolicyRegistryService,
    ) {}

    /**
     * Carrega os recursos do banco de dados para a conta e provider informados.
     */
    async loadResources(
        cloudAccountId: string,
        provider: string,
    ): Promise<AwsScanResources | GcpScanResources | AzureScanResources> {
        if (provider === 'gcp') {
            return this.loadGcpResources(cloudAccountId);
        }
        if (provider === 'azure') {
            return this.loadAzureResources(cloudAccountId);
        }
        return this.loadAwsResources(cloudAccountId);
    }

    /**
     * Carrega as supressões ativas para a organização e conta informadas.
     */
    async loadSuppressions(cloudAccountId: string, organizationId: string): Promise<GovernanceSuppression[]> {
        const now = new Date();

        const suppressions = await this.suppressionRepo
            .createQueryBuilder('s')
            .where('s.organizationId = :organizationId', { organizationId })
            .andWhere('(s.cloudAccountId IS NULL OR s.cloudAccountId = :cloudAccountId)', { cloudAccountId })
            .andWhere('(s.expiresAt IS NULL OR s.expiresAt > :now)', { now })
            .getMany();

        return suppressions;
    }

    /**
     * Executa todas as políticas registradas para o provider informado.
     * Aplica supressões ativas para excluir achados conhecidos/aprovados.
     * Quando a org tem required_tags na KB, a checagem de tags/labels é feita
     * pelo avaliador genérico (todos os recursos tagueáveis do inventário).
     */
    evaluatePolicies(
        resources: AwsScanResources | GcpScanResources | AzureScanResources,
        context: PolicyContext,
        provider: string,
        suppressions: GovernanceSuppression[] = [],
    ): ScanEvaluationResult {
        const providerPolicies = this.policyRegistry.getByProvider(provider);
        const hasOrgTags = Boolean(context.orgRules?.requiredTags?.length);

        type EnrichedResult = PolicyEvaluationResult & {
            policyId: string;
            policyName: string;
            severity: FindingSeverity;
            category: string | null;
        };

        const allFindings: EnrichedResult[] = [];

        for (const policy of providerPolicies) {
            // Org KB tag rules are evaluated once across every taggable resource.
            if (hasOrgTags && isOrgTagPolicyId(policy.id)) {
                continue;
            }

            const resourcesForPolicy = this.resolveResourcesForPolicy(policy.resourceType, resources);

            for (const resource of resourcesForPolicy) {
                const results = policy.evaluate(resource, context);

                for (const result of results) {
                    const isSuppressed =
                        result.status !== 'compliant' &&
                        this.isSuppressed(result.resourceId, policy.id, suppressions);

                    allFindings.push({
                        ...result,
                        status: isSuppressed ? 'suppressed' : result.status,
                        policyId: policy.id,
                        policyName: policy.name,
                        severity: policy.severity,
                        category: policy.category ?? null,
                    });
                }
            }
        }

        if (hasOrgTags) {
            const orgTagFindings = evaluateOrgKnowledgeTags({ provider, context, resources });
            for (const finding of orgTagFindings) {
                const isSuppressed =
                    finding.status !== 'compliant' &&
                    this.isSuppressed(finding.resourceId, finding.policyId, suppressions);

                allFindings.push({
                    ...finding,
                    status: isSuppressed ? 'suppressed' : finding.status,
                });
            }
        }

        const score = this.calculateScore(allFindings);
        const totalNonCompliant = allFindings.filter(
            (f) => f.status === 'non_compliant' || f.status === 'warning',
        ).length;
        const totalSuppressed = allFindings.filter((f) => f.status === 'suppressed').length;

        this.logger.log(
            `[${provider.toUpperCase()}] Avaliação concluída: ${allFindings.length} verificações, ` +
                `${totalNonCompliant} não-conformes, ${totalSuppressed} suprimidas, score=${score}`,
        );

        return {
            findings: allFindings,
            score,
            totalChecks: allFindings.length,
            totalNonCompliant,
            totalSuppressed,
        };
    }

    /**
     * Persiste os findings não-conformes de um job no banco de dados.
     * Não salva findings compliant nem suppressed.
     */
    async saveFindings(
        jobId: string,
        cloudAccountId: string,
        organizationId: string,
        findings: ScanEvaluationResult['findings'],
    ): Promise<void> {
        const nonCompliantFindings = findings.filter(
            (f) => f.status === 'non_compliant' || f.status === 'warning',
        );

        if (nonCompliantFindings.length === 0) {
            this.logger.log(`[${jobId}] Nenhum achado não-conforme para salvar.`);
            return;
        }

        for (let offset = 0; offset < nonCompliantFindings.length; offset += GOVERNANCE_FINDINGS_BATCH_SIZE) {
            const batch = nonCompliantFindings.slice(offset, offset + GOVERNANCE_FINDINGS_BATCH_SIZE);

            const entities = batch.map((f) =>
                this.findingRepo.create({
                    jobId,
                    cloudAccountId,
                    organizationId,
                    resourceId: f.resourceId,
                    resourceType: f.resourceType,
                    policyId: f.policyId,
                    policyName: f.policyName,
                    severity: f.severity,
                    status: f.status as FindingStatus,
                    description: f.description,
                    recommendation: f.recommendation,
                    metadata: f.metadata ?? null,
                    category: f.category,
                }),
            );

            await this.findingRepo.save(entities);
        }

        this.logger.log(
            `[${jobId}] ${nonCompliantFindings.length} findings salvos em lotes de ${GOVERNANCE_FINDINGS_BATCH_SIZE}.`,
        );
    }

    // ── Private: resource loaders ─────────────────────────────────────────────

    private async loadAwsResources(cloudAccountId: string): Promise<AwsScanResources> {
        const [
            vpcs,
            s3Buckets,
            securityGroups,
            cloudTrailTrails,
            rdsInstances,
            kmsKeys,
            guardDutyDetectors,
            eksClusters,
            iamRoles,
            lambdaFunctions,
            dynamoTables,
            sqsQueues,
            snsTopics,
            loadBalancers,
            ecsClusters,
            ecrRepositories,
            secrets,
            elasticacheClusters,
            apiGateways,
            cloudFrontDistributions,
            wafWebAcls,
            route53Zones,
            ecsServices,
            ecsTaskDefinitions,
        ] = await Promise.all([
            this.vpcRepo.find({ where: { cloudAccountId } }),
            this.s3Repo.find({ where: { cloudAccountId } }),
            this.sgRepo.find({ where: { cloudAccountId } }),
            this.cloudTrailRepo.find({ where: { cloudAccountId } }),
            this.rdsRepo.find({ where: { cloudAccountId } }),
            this.kmsRepo.find({ where: { cloudAccountId } }),
            this.guardDutyRepo.find({ where: { cloudAccountId } }),
            this.eksRepo.find({ where: { cloudAccountId } }),
            this.iamRoleRepo.find({ where: { cloudAccountId } }),
            this.lambdaRepo.find({ where: { cloudAccountId } }),
            this.dynamoRepo.find({ where: { cloudAccountId } }),
            this.sqsRepo.find({ where: { cloudAccountId } }),
            this.snsRepo.find({ where: { cloudAccountId } }),
            this.elbRepo.find({ where: { cloudAccountId } }),
            this.ecsRepo.find({ where: { cloudAccountId } }),
            this.ecrRepo.find({ where: { cloudAccountId } }),
            this.secretsRepo.find({ where: { cloudAccountId } }),
            this.elasticacheRepo.find({ where: { cloudAccountId } }),
            this.apiGatewayRepo.find({ where: { cloudAccountId } }),
            this.cloudFrontRepo.find({ where: { cloudAccountId } }),
            this.wafRepo.find({ where: { cloudAccountId } }),
            this.route53Repo.find({ where: { cloudAccountId } }),
            this.ecsServiceRepo.find({ where: { cloudAccountId } }),
            this.ecsTaskDefRepo.find({ where: { cloudAccountId } }),
        ]);

        const vpcUuids = vpcs.map((v) => v.id);
        const [ec2Instances, subnets, routeTables] =
            vpcUuids.length > 0
                ? await Promise.all([
                      this.ec2Repo.find({ where: { vpcId: In(vpcUuids) } }),
                      this.subnetRepo.find({ where: { vpcId: In(vpcUuids) } }),
                      this.routeTableRepo.find({ where: { vpcId: In(vpcUuids) } }),
                  ])
                : [[], [], []];

        this.logger.log(
            `[AWS] Recursos carregados para conta ${cloudAccountId}: ` +
                `S3=${s3Buckets.length}, SG=${securityGroups.length}, EC2=${ec2Instances.length}, ` +
                `RDS=${rdsInstances.length}, Lambda=${lambdaFunctions.length}, VPC=${vpcs.length}, ` +
                `DynamoDB=${dynamoTables.length}, SQS=${sqsQueues.length}, SNS=${snsTopics.length}, ` +
                `ELB=${loadBalancers.length}, ECS=${ecsClusters.length}, ECR=${ecrRepositories.length}`,
        );

        return {
            vpcs,
            s3Buckets,
            securityGroups,
            ec2Instances,
            cloudTrailTrails,
            rdsInstances,
            kmsKeys,
            guardDutyDetectors,
            eksClusters,
            iamRoles,
            lambdaFunctions,
            dynamoTables,
            sqsQueues,
            snsTopics,
            loadBalancers,
            ecsClusters,
            ecrRepositories,
            secrets,
            elasticacheClusters,
            apiGateways,
            cloudFrontDistributions,
            wafWebAcls,
            route53Zones,
            subnets,
            routeTables,
            ecsServices,
            ecsTaskDefinitions,
        };
    }

    private async loadGcpResources(cloudAccountId: string): Promise<GcpScanResources> {
        const [storageBuckets, firewallRules, vmInstances, sqlInstances, gkeClusters, cloudRunServices, cloudRunJobs] =
            await Promise.all([
                this.gcpStorageBucketRepo.find({ where: { cloudAccountId } }),
                this.gcpFirewallRuleRepo.find({ where: { cloudAccountId } }),
                this.gcpVmInstanceRepo.find({ where: { cloudAccountId } }),
                this.gcpSqlInstanceRepo.find({ where: { cloudAccountId } }),
                this.gcpGkeClusterRepo.find({ where: { cloudAccountId } }),
                this.gcpCloudRunServiceRepo.find({ where: { cloudAccountId } }),
                this.gcpCloudRunJobRepo.find({ where: { cloudAccountId } }),
            ]);

        this.logger.log(
            `[GCP] Recursos carregados para conta ${cloudAccountId}: ` +
                `Buckets=${storageBuckets.length}, Firewalls=${firewallRules.length}, VMs=${vmInstances.length}, ` +
                `SQL=${sqlInstances.length}, GKE=${gkeClusters.length}, CloudRun=${cloudRunServices.length}/${cloudRunJobs.length}`,
        );

        return {
            storageBuckets,
            firewallRules,
            vmInstances,
            sqlInstances,
            gkeClusters,
            cloudRunServices,
            cloudRunJobs,
        };
    }

    private async loadAzureResources(cloudAccountId: string): Promise<AzureScanResources> {
        const [
            virtualMachines,
            storageAccounts,
            sqlDatabases,
            webApps,
            nsgs,
            keyVaults,
            aksClusters,
            disks,
            virtualNetworks,
            loadBalancers,
            cosmosAccounts,
            postgresServers,
            sqlServers,
            appServicePlans,
            resourceGroups,
            applicationGateways,
            publicIps,
            networkInterfaces,
            vmss,
            recoveryVaults,
        ] = await Promise.all([
            this.azureVmRepo.find({ where: { cloudAccountId } }),
            this.azureStorageRepo.find({ where: { cloudAccountId } }),
            this.azureSqlDbRepo.find({ where: { cloudAccountId } }),
            this.azureWebAppRepo.find({ where: { cloudAccountId } }),
            this.azureNsgRepo.find({ where: { cloudAccountId } }),
            this.azureKeyVaultRepo.find({ where: { cloudAccountId } }),
            this.azureAksRepo.find({ where: { cloudAccountId } }),
            this.azureDiskRepo.find({ where: { cloudAccountId } }),
            this.azureVnetRepo.find({ where: { cloudAccountId } }),
            this.azureLbRepo.find({ where: { cloudAccountId } }),
            this.azureCosmosRepo.find({ where: { cloudAccountId } }),
            this.azurePostgresRepo.find({ where: { cloudAccountId } }),
            this.azureSqlServerRepo.find({ where: { cloudAccountId } }),
            this.azureAspRepo.find({ where: { cloudAccountId } }),
            this.azureRgRepo.find({ where: { cloudAccountId } }),
            this.azureAppGwRepo.find({ where: { cloudAccountId } }),
            this.azurePipRepo.find({ where: { cloudAccountId } }),
            this.azureNicRepo.find({ where: { cloudAccountId } }),
            this.azureVmssRepo.find({ where: { cloudAccountId } }),
            this.azureRecoveryVaultRepo.find({ where: { cloudAccountId } }),
        ]);

        this.logger.log(
            `[AZURE] Recursos carregados para conta ${cloudAccountId}: ` +
                `VMs=${virtualMachines.length}, Storage=${storageAccounts.length}, SQL=${sqlDatabases.length}, ` +
                `WebApps=${webApps.length}, NSGs=${nsgs.length}, KeyVault=${keyVaults.length}, AKS=${aksClusters.length}, ` +
                `Disks=${disks.length}, VNets=${virtualNetworks.length}, RG=${resourceGroups.length}`,
        );

        return {
            virtualMachines,
            storageAccounts,
            sqlDatabases,
            webApps,
            nsgs,
            keyVaults,
            aksClusters,
            disks,
            virtualNetworks,
            loadBalancers,
            cosmosAccounts,
            postgresServers,
            sqlServers,
            appServicePlans,
            resourceGroups,
            applicationGateways,
            publicIps,
            networkInterfaces,
            vmss,
            recoveryVaults,
        };
    }

    // ── Private: helpers ──────────────────────────────────────────────────────

    private isSuppressed(resourceId: string, policyId: string, suppressions: GovernanceSuppression[]): boolean {
        return suppressions.some(
            (s) =>
                (s.policyId === '*' || s.policyId === policyId) &&
                (s.resourceId === null || s.resourceId === resourceId),
        );
    }

    private calculateScore(findings: Array<{ status: FindingStatus; severity: FindingSeverity }>): number {
        if (findings.length === 0) return 100;

        let totalWeight = 0;
        let positiveWeight = 0;

        for (const finding of findings) {
            const weight = SEVERITY_WEIGHTS[finding.severity];
            totalWeight += weight;
            if (finding.status === 'compliant' || finding.status === 'suppressed') {
                positiveWeight += weight;
            }
        }

        return totalWeight === 0 ? 100 : Math.round((positiveWeight / totalWeight) * 100);
    }

    private resolveResourcesForPolicy(
        resourceType: string,
        resources: AwsScanResources | GcpScanResources | AzureScanResources,
    ): any[] {
        if ('s3Buckets' in resources) {
            switch (resourceType) {
                case 'S3Bucket':
                    return resources.s3Buckets;
                case 'SecurityGroup':
                    return resources.securityGroups;
                case 'EC2Instance':
                    return resources.ec2Instances;
                case 'CloudTrailTrail':
                    return resources.cloudTrailTrails;
                case 'RDSInstance':
                    return resources.rdsInstances;
                case 'KMSKey':
                    return resources.kmsKeys;
                case 'GuardDutyDetector':
                    return resources.guardDutyDetectors;
                case 'EKSCluster':
                    return resources.eksClusters;
                case 'IAMRole':
                    return resources.iamRoles;
                case 'LambdaFunction':
                    return resources.lambdaFunctions;
                case 'Vpc':
                    return resources.vpcs;
                case 'DynamoDbTable':
                    return resources.dynamoTables;
                case 'SqsQueue':
                    return resources.sqsQueues;
                case 'SnsTopic':
                    return resources.snsTopics;
                case 'LoadBalancer':
                    return resources.loadBalancers;
                case 'EcsCluster':
                    return resources.ecsClusters;
                case 'EcrRepository':
                    return resources.ecrRepositories;
                case 'SecretsManagerSecret':
                    return resources.secrets;
                case 'ElastiCacheCluster':
                    return resources.elasticacheClusters;
                case 'ApiGatewayRestApi':
                    return resources.apiGateways;
                case 'CloudFrontDistribution':
                    return resources.cloudFrontDistributions;
                case 'WafWebAcl':
                    return resources.wafWebAcls;
                case 'Route53HostedZone':
                    return resources.route53Zones;
                case 'Subnet':
                    return resources.subnets;
                case 'RouteTable':
                    return resources.routeTables;
                case 'EcsService':
                    return resources.ecsServices;
                case 'EcsTaskDefinition':
                    return resources.ecsTaskDefinitions;
            }
        }

        if ('storageBuckets' in resources) {
            switch (resourceType) {
                case 'GcpStorageBucket':
                    return resources.storageBuckets;
                case 'GcpFirewallRule':
                    return resources.firewallRules;
                case 'GcpVmInstance':
                    return resources.vmInstances;
                case 'GcpSqlInstance':
                    return resources.sqlInstances;
                case 'GcpGkeCluster':
                    return resources.gkeClusters;
                case 'GcpCloudRunService':
                    return resources.cloudRunServices;
                case 'GcpCloudRunJob':
                    return resources.cloudRunJobs;
            }
        }

        if ('virtualMachines' in resources) {
            switch (resourceType) {
                case 'AzureVirtualMachine':
                    return resources.virtualMachines;
                case 'AzureStorageAccount':
                    return resources.storageAccounts;
                case 'AzureSqlDatabase':
                    return resources.sqlDatabases;
                case 'AzureWebApp':
                    return resources.webApps;
                case 'AzureNsg':
                    return resources.nsgs;
                case 'AzureKeyVault':
                    return resources.keyVaults;
                case 'AzureAksCluster':
                    return resources.aksClusters;
                case 'AzureDisk':
                    return resources.disks;
                case 'AzureVirtualNetwork':
                    return resources.virtualNetworks;
                case 'AzureLoadBalancer':
                    return resources.loadBalancers;
                case 'AzureCosmosDb':
                    return resources.cosmosAccounts;
                case 'AzurePostgresServer':
                    return resources.postgresServers;
                case 'AzureSqlServer':
                    return resources.sqlServers;
                case 'AzureAppServicePlan':
                    return resources.appServicePlans;
                case 'AzureResourceGroup':
                    return resources.resourceGroups;
                case 'AzureApplicationGateway':
                    return resources.applicationGateways;
                case 'AzurePublicIp':
                    return resources.publicIps;
                case 'AzureNetworkInterface':
                    return resources.networkInterfaces;
                case 'AzureVmss':
                    return resources.vmss;
                case 'AzureRecoveryVault':
                    return resources.recoveryVaults;
            }
        }

        this.logger.warn(`Nenhum recurso mapeado para resourceType="${resourceType}"`);
        return [];
    }
}
