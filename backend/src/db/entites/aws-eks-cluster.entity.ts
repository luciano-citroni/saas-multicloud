import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { AwsVpc } from './aws-vpc.entity';
import { AwsIamRole } from './aws-iam-role.entity';

/**
 * Estados possíveis de um cluster EKS.
 */
export enum EksClusterStatus {
    CREATING = 'CREATING',
    ACTIVE = 'ACTIVE',
    DELETING = 'DELETING',
    FAILED = 'FAILED',
    UPDATING = 'UPDATING',
    PENDING = 'PENDING',
}

/**
 * Representa um cluster EKS sincronizado da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - O cluster está vinculado à CloudAccount, que já pertence a uma organização.
 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_eks_clusters')
export class AwsEksCluster {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**
     * ID da CloudAccount que este cluster pertence.
     */
    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**
     * ARN do cluster na AWS.
     */
    @Column({ type: 'varchar', length: 512, name: 'cluster_arn', unique: true })
    clusterArn!: string;

    /**
     * Nome do cluster EKS.
     */
    @Column({ type: 'varchar', length: 255, name: 'cluster_name' })
    clusterName!: string;

    /**
     * Status atual do cluster na AWS.
     */
    @Column({ type: 'varchar', length: 30, name: 'status' })
    status!: string;

    /**
     * Versão do Kubernetes do cluster.
     */
    @Column({ type: 'varchar', length: 20, name: 'version', nullable: true })
    version!: string | null;

    /**
     * Endpoint do API Server do cluster.
     */
    @Column({ type: 'varchar', length: 1024, name: 'endpoint', nullable: true })
    endpoint!: string | null;

    /**
     * ARN da role IAM usada pelo control plane.
     */
    @Column({ type: 'varchar', length: 2048, name: 'role_arn', nullable: true })
    roleArn!: string | null;

    /**
     * ID da role IAM no banco de dados.
     */
    @Column({ type: 'uuid', name: 'iam_role_id', nullable: true })
    iamRoleId!: string | null;

    /**
     * VPC ID na AWS.
     */
    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /**
     * ID da VPC no banco de dados.
     */
    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /**
     * Security Group IDs na AWS vinculados ao cluster.
     */
    @Column({ type: 'jsonb', name: 'aws_security_group_ids', nullable: true })
    awsSecurityGroupIds!: string[] | null;

    /**
     * Security Group IDs no banco de dados.
     */
    @Column('uuid', { array: true, name: 'security_group_ids', nullable: true })
    securityGroupIds!: string[] | null;

    /**
     * EC2 Instance IDs no banco de dados relacionados ao cluster.
     */
    @Column('uuid', { array: true, name: 'ec2_instance_ids', nullable: true })
    ec2InstanceIds!: string[] | null;

    /**
     * Configuração de endpoint público do cluster.
     */
    @Column({ type: 'boolean', name: 'endpoint_public_access', default: true })
    endpointPublicAccess!: boolean;

    /**
     * Configuração de endpoint privado do cluster.
     */
    @Column({ type: 'boolean', name: 'endpoint_private_access', default: false })
    endpointPrivateAccess!: boolean;

    /**
     * Lista de CIDRs permitidos no endpoint público.
     */
    @Column({ type: 'jsonb', name: 'public_access_cidrs', nullable: true })
    publicAccessCidrs!: string[] | null;

    /**
     * Versão da plataforma EKS.
     */
    @Column({ type: 'varchar', length: 30, name: 'platform_version', nullable: true })
    platformVersion!: string | null;

    /**
     * Configuração de logs do cluster.
     */
    @Column({ type: 'jsonb', name: 'logging', nullable: true })
    logging!: Record<string, any> | null;

    /**
     * Data de criação do cluster na AWS.
     */
    @Column({ type: 'timestamp', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

    /**
     * Tags do cluster em JSON.
     */
    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

    /**
     * Timestamp da última sincronização com AWS.
     */
    @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @ManyToOne(() => AwsVpc, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'vpc_id' })
    vpc!: AwsVpc | null;

    @ManyToOne(() => AwsIamRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'iam_role_id' })
    iamRole!: AwsIamRole | null;
}
