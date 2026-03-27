import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { AwsVpc } from '../../db/entites/aws-vpc.entity';
import { AwsEc2Instance } from '../../db/entites/aws-ec2.entity';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';
import { AwsSecurityGroup } from '../../db/entites/aws-security-group.entity';
import { AwsCloudTrailTrail } from '../../db/entites/aws-cloudtrail-trail.entity';
import { AwsRdsInstance } from '../../db/entites/aws-rds-instance.entity';
import { GovernanceFinding, FindingSeverity, FindingStatus } from '../../db/entites/governance-finding.entity';

import { PolicyRegistryService } from '../policies/policy-registry.service';
import { PolicyContext, PolicyEvaluationResult } from '../policies/policy.interface';
import { GOVERNANCE_FINDINGS_BATCH_SIZE } from '../constants';

export interface ScanResources {
    s3Buckets: AwsS3Bucket[];
    securityGroups: AwsSecurityGroup[];
    ec2Instances: AwsEc2Instance[];
    cloudTrailTrails: AwsCloudTrailTrail[];
    rdsInstances: AwsRdsInstance[];
}

export interface ScanEvaluationResult {
    findings: Array<PolicyEvaluationResult & { policyId: string; policyName: string; severity: FindingSeverity }>;
    score: number;
    totalChecks: number;
    totalNonCompliant: number;
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

        @InjectRepository(GovernanceFinding)
        private readonly findingRepo: Repository<GovernanceFinding>,

        private readonly policyRegistry: PolicyRegistryService
    ) {}

    /**
     * Carrega os recursos AWS do banco de dados para a conta informada.
     * EC2 não tem cloudAccountId direto — é obtido via VPCs da conta.
     */
    async loadResources(cloudAccountId: string): Promise<ScanResources> {
        const [vpcs, s3Buckets, securityGroups, cloudTrailTrails, rdsInstances] = await Promise.all([
            this.vpcRepo.find({ where: { cloudAccountId } }),
            this.s3Repo.find({ where: { cloudAccountId } }),
            this.sgRepo.find({ where: { cloudAccountId } }),
            this.cloudTrailRepo.find({ where: { cloudAccountId } }),
            this.rdsRepo.find({ where: { cloudAccountId } }),
        ]);

        const vpcUuids = vpcs.map((v) => v.id);
        const ec2Instances = vpcUuids.length > 0 ? await this.ec2Repo.find({ where: { vpcId: In(vpcUuids) } }) : [];

        this.logger.log(
            `Recursos carregados para conta ${cloudAccountId}: ` +
                `S3=${s3Buckets.length}, SG=${securityGroups.length}, EC2=${ec2Instances.length}, CloudTrail=${cloudTrailTrails.length}, RDS=${rdsInstances.length}`
        );

        return { s3Buckets, securityGroups, ec2Instances, cloudTrailTrails, rdsInstances };
    }

    /**
     * Executa todas as políticas registradas contra os recursos carregados.
     * Retorna os findings individuais, o score e os totais.
     */
    evaluatePolicies(resources: ScanResources, context: PolicyContext): ScanEvaluationResult {
        const awsPolicies = this.policyRegistry.getByProvider('aws');

        type EnrichedResult = PolicyEvaluationResult & {
            policyId: string;
            policyName: string;
            severity: FindingSeverity;
        };

        const allFindings: EnrichedResult[] = [];

        for (const policy of awsPolicies) {
            const resourcesForPolicy = this.resolveResourcesForPolicy(policy.resourceType, resources);

            for (const resource of resourcesForPolicy) {
                const results = policy.evaluate(resource, context);

                for (const result of results) {
                    allFindings.push({
                        ...result,
                        policyId: policy.id,
                        policyName: policy.name,
                        severity: policy.severity,
                    });
                }
            }
        }

        const score = this.calculateScore(allFindings);
        const totalNonCompliant = allFindings.filter((f) => f.status !== 'compliant').length;

        this.logger.log(`Avaliação concluída: ${allFindings.length} verificações, ` + `${totalNonCompliant} não-conformes, score=${score}`);

        return {
            findings: allFindings,
            score,
            totalChecks: allFindings.length,
            totalNonCompliant,
        };
    }

    /**
     * Persiste os findings de um job no banco de dados.
     * Salva apenas achados não-conformes e warnings para manter o volume gerenciável.
     */
    async saveFindings(jobId: string, cloudAccountId: string, organizationId: string, findings: ScanEvaluationResult['findings']): Promise<void> {
        const nonCompliantFindings = findings.filter((f) => f.status !== 'compliant');

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
                })
            );

            await this.findingRepo.save(entities);
        }

        this.logger.log(`[${jobId}] ${nonCompliantFindings.length} findings salvos em lotes de ${GOVERNANCE_FINDINGS_BATCH_SIZE}.`);
    }

    /**
     * Calcula o score de governança (0–100) com base nos findings.
     *
     * Fórmula: (soma dos pesos dos checks conformes) / (soma total dos pesos) × 100
     * Itens críticos têm peso maior, portanto corrigi-los impacta mais o score.
     */
    private calculateScore(findings: Array<{ status: FindingStatus; severity: FindingSeverity }>): number {
        if (findings.length === 0) return 100;

        let totalWeight = 0;
        let compliantWeight = 0;

        for (const finding of findings) {
            const weight = SEVERITY_WEIGHTS[finding.severity];
            totalWeight += weight;
            if (finding.status === 'compliant') {
                compliantWeight += weight;
            }
        }

        return totalWeight === 0 ? 100 : Math.round((compliantWeight / totalWeight) * 100);
    }

    /**
     * Mapeia o resourceType da política para a coleção de recursos correspondente.
     */
    private resolveResourcesForPolicy(resourceType: string, resources: ScanResources): any[] {
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
            default:
                this.logger.warn(`Nenhum recurso mapeado para resourceType="${resourceType}"`);
                return [];
        }
    }
}
