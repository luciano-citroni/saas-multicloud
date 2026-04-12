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

// GCP entities
import { GcpStorageBucket } from '../../db/entites/gcp-storage-bucket.entity';
import { GcpFirewallRule } from '../../db/entites/gcp-firewall-rule.entity';
import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';
import { GcpSqlInstance } from '../../db/entites/gcp-sql-instance.entity';
import { GcpGkeCluster } from '../../db/entites/gcp-gke-cluster.entity';

import { GovernanceFinding, FindingSeverity, FindingStatus } from '../../db/entites/governance-finding.entity';
import { GovernanceSuppression } from '../../db/entites/governance-suppression.entity';

import { PolicyRegistryService } from '../policies/policy-registry.service';
import { PolicyContext, PolicyEvaluationResult } from '../policies/policy.interface';
import { GOVERNANCE_FINDINGS_BATCH_SIZE } from '../constants';

// ── Resource container interfaces ────────────────────────────────────────────

export interface AwsScanResources {
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
}

export interface GcpScanResources {
    storageBuckets: GcpStorageBucket[];
    firewallRules: GcpFirewallRule[];
    vmInstances: GcpVmInstance[];
    sqlInstances: GcpSqlInstance[];
    gkeClusters: GcpGkeCluster[];
}

/**
 * @deprecated Use AwsScanResources directly. Kept for backwards compatibility.
 */
export type ScanResources = AwsScanResources;

export interface ScanEvaluationResult {
    findings: Array<PolicyEvaluationResult & { policyId: string; policyName: string; severity: FindingSeverity; category: string | null }>;
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

        // ── Shared ────────────────────────────────────────────────────────
        @InjectRepository(GovernanceFinding)
        private readonly findingRepo: Repository<GovernanceFinding>,

        @InjectRepository(GovernanceSuppression)
        private readonly suppressionRepo: Repository<GovernanceSuppression>,

        private readonly policyRegistry: PolicyRegistryService
    ) {}

    /**
     * Carrega os recursos do banco de dados para a conta e provider informados.
     */
    async loadResources(cloudAccountId: string, provider: string): Promise<AwsScanResources | GcpScanResources> {
        if (provider === 'gcp') {
            return this.loadGcpResources(cloudAccountId);
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
     */
    evaluatePolicies(
        resources: AwsScanResources | GcpScanResources,
        context: PolicyContext,
        provider: string,
        suppressions: GovernanceSuppression[] = []
    ): ScanEvaluationResult {
        const providerPolicies = this.policyRegistry.getByProvider(provider);

        type EnrichedResult = PolicyEvaluationResult & {
            policyId: string;
            policyName: string;
            severity: FindingSeverity;
            category: string | null;
        };

        const allFindings: EnrichedResult[] = [];

        for (const policy of providerPolicies) {
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

        const score = this.calculateScore(allFindings);
        const totalNonCompliant = allFindings.filter((f) => f.status === 'non_compliant' || f.status === 'warning').length;
        const totalSuppressed = allFindings.filter((f) => f.status === 'suppressed').length;

        this.logger.log(
            `[${provider.toUpperCase()}] Avaliação concluída: ${allFindings.length} verificações, ` +
                `${totalNonCompliant} não-conformes, ${totalSuppressed} suprimidas, score=${score}`
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
    async saveFindings(jobId: string, cloudAccountId: string, organizationId: string, findings: ScanEvaluationResult['findings']): Promise<void> {
        const nonCompliantFindings = findings.filter((f) => f.status === 'non_compliant' || f.status === 'warning');

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
                })
            );

            await this.findingRepo.save(entities);
        }

        this.logger.log(`[${jobId}] ${nonCompliantFindings.length} findings salvos em lotes de ${GOVERNANCE_FINDINGS_BATCH_SIZE}.`);
    }

    // ── Private: resource loaders ─────────────────────────────────────────────

    private async loadAwsResources(cloudAccountId: string): Promise<AwsScanResources> {
        const [vpcs, s3Buckets, securityGroups, cloudTrailTrails, rdsInstances, kmsKeys, guardDutyDetectors, eksClusters, iamRoles, lambdaFunctions] =
            await Promise.all([
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
            ]);

        const vpcUuids = vpcs.map((v) => v.id);
        const ec2Instances = vpcUuids.length > 0 ? await this.ec2Repo.find({ where: { vpcId: In(vpcUuids) } }) : [];

        this.logger.log(
            `[AWS] Recursos carregados para conta ${cloudAccountId}: ` +
                `S3=${s3Buckets.length}, SG=${securityGroups.length}, EC2=${ec2Instances.length}, CloudTrail=${cloudTrailTrails.length}, ` +
                `RDS=${rdsInstances.length}, KMS=${kmsKeys.length}, GuardDuty=${guardDutyDetectors.length}, EKS=${eksClusters.length}, ` +
                `IAMRole=${iamRoles.length}, Lambda=${lambdaFunctions.length}`
        );

        return {
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
        };
    }

    private async loadGcpResources(cloudAccountId: string): Promise<GcpScanResources> {
        const [storageBuckets, firewallRules, vmInstances, sqlInstances, gkeClusters] = await Promise.all([
            this.gcpStorageBucketRepo.find({ where: { cloudAccountId } }),
            this.gcpFirewallRuleRepo.find({ where: { cloudAccountId } }),
            this.gcpVmInstanceRepo.find({ where: { cloudAccountId } }),
            this.gcpSqlInstanceRepo.find({ where: { cloudAccountId } }),
            this.gcpGkeClusterRepo.find({ where: { cloudAccountId } }),
        ]);

        this.logger.log(
            `[GCP] Recursos carregados para conta ${cloudAccountId}: ` +
                `Buckets=${storageBuckets.length}, Firewalls=${firewallRules.length}, VMs=${vmInstances.length}, SQL=${sqlInstances.length}, GKE=${gkeClusters.length}`
        );

        return { storageBuckets, firewallRules, vmInstances, sqlInstances, gkeClusters };
    }

    // ── Private: helpers ──────────────────────────────────────────────────────

    /**
     * Verifica se um finding deve ser suprimido com base nas supressões ativas.
     */
    private isSuppressed(resourceId: string, policyId: string, suppressions: GovernanceSuppression[]): boolean {
        return suppressions.some(
            (s) =>
                (s.policyId === '*' || s.policyId === policyId) &&
                (s.resourceId === null || s.resourceId === resourceId)
        );
    }

    /**
     * Calcula o score de governança (0–100).
     * Findings suprimidos são tratados como compliant para fins de pontuação.
     *
     * Fórmula: (soma dos pesos dos checks conformes + suprimidos) / (soma total) × 100
     */
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

    /**
     * Mapeia o resourceType da política para a coleção de recursos correspondente.
     */
    private resolveResourcesForPolicy(resourceType: string, resources: AwsScanResources | GcpScanResources): any[] {
        // ── AWS types ────────────────────────────────────────────────────────
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
            }
        }

        // ── GCP types ────────────────────────────────────────────────────────
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
            }
        }

        this.logger.warn(`Nenhum recurso mapeado para resourceType="${resourceType}"`);
        return [];
    }
}
