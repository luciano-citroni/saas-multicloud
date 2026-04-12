import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { GovernanceJob } from './governance-job.entity';

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'compliant' | 'non_compliant' | 'warning' | 'suppressed';

@Entity('governance_findings')
@Index('IDX_governance_findings_job_id', ['jobId'])
@Index('IDX_governance_findings_cloud_account_id', ['cloudAccountId'])
@Index('IDX_governance_findings_status', ['status'])
@Index('IDX_governance_findings_severity', ['severity'])
@Index('IDX_governance_findings_category', ['category'])
export class GovernanceFinding {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'job_id' })
    jobId!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    @Column({ type: 'uuid', name: 'organization_id' })
    organizationId!: string;

    /** ID do recurso na AWS (ARN, bucket name, instance ID, etc). */
    @Column({ type: 'varchar', length: 512, name: 'resource_id' })
    resourceId!: string;

    /** Tipo do recurso (ex: S3Bucket, SecurityGroup, EC2Instance). */
    @Column({ type: 'varchar', length: 100, name: 'resource_type' })
    resourceType!: string;

    /** ID da política que gerou este achado (ex: aws-s3-no-public-access). */
    @Column({ type: 'varchar', length: 100, name: 'policy_id' })
    policyId!: string;

    /** Nome legível da política. */
    @Column({ type: 'varchar', length: 255, name: 'policy_name' })
    policyName!: string;

    /** Severidade: low, medium, high, critical. */
    @Column({ type: 'varchar', length: 20 })
    severity!: FindingSeverity;

    /** Status do achado: compliant, non_compliant ou warning. */
    @Column({ type: 'varchar', length: 20 })
    status!: FindingStatus;

    /** Descrição do problema encontrado ou da conformidade verificada. */
    @Column({ type: 'text' })
    description!: string;

    /** Recomendação de correção para achados não-conformes. */
    @Column({ type: 'text' })
    recommendation!: string;

    /** Metadados adicionais sobre o achado (contexto específico do recurso). */
    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, any> | null;

    /**
     * Categoria funcional da política que gerou o achado.
     * Permite agrupamento de score por domínio (network, storage, identity, etc).
     */
    @Column({ type: 'varchar', length: 30, nullable: true })
    category!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => GovernanceJob, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'job_id' })
    job!: GovernanceJob;
}
