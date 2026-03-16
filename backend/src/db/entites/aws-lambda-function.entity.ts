import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsVpc } from './aws-vpc.entity';

import { AwsIamRole } from './aws-iam-role.entity';

/**


 * Representa uma função Lambda sincronizada da Amazon Web Services.


 */

@Entity('aws_lambda_functions')
export class AwsLambdaFunction {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /** ARN da função Lambda na AWS. */

    @Column({ type: 'varchar', length: 1024, name: 'function_arn', unique: true })
    functionArn!: string;

    /** Nome da função Lambda. */

    @Column({ type: 'varchar', length: 255, name: 'function_name' })
    functionName!: string;

    /** Descrição da função. */

    @Column({ type: 'varchar', length: 1024, name: 'description', nullable: true })
    description!: string | null;

    /** Runtime (ex: nodejs20.x, python3.12). */

    @Column({ type: 'varchar', length: 50, name: 'runtime', nullable: true })
    runtime!: string | null;

    /** Handler da função (ex: index.handler). */

    @Column({ type: 'varchar', length: 255, name: 'handler', nullable: true })
    handler!: string | null;

    /** ARN da role IAM de execução. */

    @Column({ type: 'varchar', length: 2048, name: 'role_arn', nullable: true })
    roleArn!: string | null;

    /** ID da role IAM no banco de dados. */

    @Column({ type: 'uuid', name: 'iam_role_id', nullable: true })
    iamRoleId!: string | null;

    /** Tamanho do código em bytes. */

    @Column({ type: 'bigint', name: 'code_size', nullable: true })
    codeSize!: number | null;

    /** Memória alocada em MB. */

    @Column({ type: 'int', name: 'memory_size', nullable: true })
    memorySize!: number | null;

    /** Timeout em segundos. */

    @Column({ type: 'int', name: 'timeout', nullable: true })
    timeout!: number | null;

    /** Estado da função (Active, Inactive, Pending, Failed). */

    @Column({ type: 'varchar', length: 30, name: 'state', nullable: true })
    state!: string | null;

    /** Arquitetura (x86_64, arm64). */

    @Column({ type: 'varchar', length: 20, name: 'architectures', nullable: true })
    architectures!: string | null;

    /** Versão atual da função. */

    @Column({ type: 'varchar', length: 50, name: 'version', nullable: true })
    version!: string | null;

    /** ID da VPC na AWS (se a função está em VPC). */

    @Column({ type: 'varchar', length: 50, name: 'aws_vpc_id', nullable: true })
    awsVpcId!: string | null;

    /** ID da VPC no banco de dados. */

    @Column({ type: 'uuid', name: 'vpc_id', nullable: true })
    vpcId!: string | null;

    /** IDs de subnets na AWS. */

    @Column({ type: 'jsonb', name: 'aws_subnet_ids', nullable: true })
    awsSubnetIds!: string[] | null;

    /** IDs de subnets no banco de dados. */

    @Column('uuid', { array: true, name: 'subnet_ids', nullable: true })
    subnetIds!: string[] | null;

    /** IDs de Security Groups na AWS. */

    @Column({ type: 'jsonb', name: 'aws_security_group_ids', nullable: true })
    awsSecurityGroupIds!: string[] | null;

    /** IDs de Security Groups no banco de dados. */

    @Column('uuid', { array: true, name: 'security_group_ids', nullable: true })
    securityGroupIds!: string[] | null;

    /** Variáveis de ambiente (chaves apenas, sem valores por segurança). */

    @Column({ type: 'jsonb', name: 'environment_variables_keys', nullable: true })
    environmentVariablesKeys!: string[] | null;

    /** Data da última modificação na AWS. */

    @Column({ type: 'timestamp', name: 'last_modified_at_aws', nullable: true })
    lastModifiedAtAws!: Date | null;

    /** Tags em JSON. */

    @Column({ type: 'jsonb', nullable: true })
    tags!: Record<string, string> | null;

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
