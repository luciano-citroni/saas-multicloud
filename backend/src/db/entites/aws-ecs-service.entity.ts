import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsEcsCluster } from './aws-ecs-cluster.entity';

import { AwsEcsTaskDefinition } from './aws-ecs-task-definition.entity';

import { AwsIamRole } from './aws-iam-role.entity';

/**


 * Status possíveis de um serviço ECS.


 */

export enum EcsServiceStatus {
    ACTIVE = 'ACTIVE',

    DRAINING = 'DRAINING',

    INACTIVE = 'INACTIVE',
}

/**


 * Tipos de lançamento do serviço ECS.


 */

export enum EcsLaunchType {
    EC2 = 'EC2',

    FARGATE = 'FARGATE',

    EXTERNAL = 'EXTERNAL',
}

/**


 * Representa um serviço ECS (Elastic Container Service) da Amazon Web Services.


 * Um serviço ECS mantém e escala um conjunto de tasks baseadas em uma task definition.


 *


 * Isolamento de tenant:


 * - O serviço pertence a uma CloudAccount, que pertence a uma organização.


 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_ecs_services')
export class AwsEcsService {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**


     * ID da conta cloud à qual este serviço pertence.


     */

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**


     * ID do cluster ECS ao qual este serviço pertence.


     */

    @Column({ type: 'uuid', name: 'cluster_id' })
    clusterId!: string;

    /**


     * ID da task definition utilizada por este serviço.


     */

    @Column({ type: 'uuid', name: 'task_definition_id' })
    taskDefinitionId!: string;

    /**


     * ARN do serviço na AWS.


     */

    @Column({ type: 'varchar', length: 512, name: 'service_arn', unique: true })
    serviceArn!: string;

    /**


     * Nome do serviço.


     */

    @Column({ type: 'varchar', length: 255, name: 'service_name' })
    serviceName!: string;

    /**


     * ARN do cluster na AWS (denormalizado).


     */

    @Column({ type: 'varchar', length: 255, name: 'cluster_arn' })
    clusterArn!: string;

    /**


     * ARN da task definition na AWS (denormalizado).


     */

    @Column({ type: 'varchar', length: 512, name: 'task_definition_arn' })
    taskDefinitionArn!: string;

    /**


     * Status do serviço (ACTIVE, DRAINING, INACTIVE).


     */

    @Column({ type: 'varchar', length: 50 })
    status!: string;

    /**


     * Número desejado de tasks em execução.


     */

    @Column({ type: 'int', name: 'desired_count' })
    desiredCount!: number;

    /**


     * Número de tasks em execução.


     */

    @Column({ type: 'int', name: 'running_count', default: 0 })
    runningCount!: number;

    /**


     * Número de tasks pendentes.


     */

    @Column({ type: 'int', name: 'pending_count', default: 0 })
    pendingCount!: number;

    /**


     * Tipo de lançamento (EC2, FARGATE, EXTERNAL).


     */

    @Column({ type: 'varchar', length: 50, name: 'launch_type', nullable: true })
    launchType!: string | null;

    /**


     * Estratégia de provisionamento de capacidade.


     */

    @Column({ type: 'jsonb', name: 'capacity_provider_strategy', nullable: true })
    capacityProviderStrategy!: Record<string, any>[] | null;

    /**


     * Plataforma de versão (para Fargate).


     */

    @Column({ type: 'varchar', length: 50, name: 'platform_version', nullable: true })
    platformVersion!: string | null;

    /**


     * Família da plataforma (LINUX, WINDOWS_SERVER_*).


     */

    @Column({ type: 'varchar', length: 50, name: 'platform_family', nullable: true })
    platformFamily!: string | null;

    /**


     * ARN da role associada ao serviço.


     */

    @Column({ type: 'varchar', length: 255, name: 'role_arn', nullable: true })
    roleArn!: string | null;

    /**


     * ID da service role IAM no banco de dados (FK para aws_iam_roles).


     */

    @Column({ type: 'uuid', name: 'service_role_id', nullable: true })
    serviceRoleId!: string | null;

    /**


     * Configuração de deployment.


     */

    @Column({ type: 'jsonb', name: 'deployment_configuration', nullable: true })
    deploymentConfiguration!: Record<string, any> | null;

    /**


     * Lista de deployments ativos.


     */

    @Column({ type: 'jsonb', nullable: true })
    deployments!: Record<string, any>[] | null;

    /**


     * Configuração de rede (para awsvpc).


     */

    @Column({ type: 'jsonb', name: 'network_configuration', nullable: true })
    networkConfiguration!: Record<string, any> | null;

    /**


     * ARNs dos load balancers associados.


     */

    @Column({ type: 'jsonb', name: 'load_balancers', nullable: true })
    loadBalancers!: Record<string, any>[] | null;

    /**


     * Service registries (para service discovery).


     */

    @Column({ type: 'jsonb', name: 'service_registries', nullable: true })
    serviceRegistries!: Record<string, any>[] | null;

    /**


     * Estratégia de escalonamento.


     */

    @Column({ type: 'jsonb', name: 'scheduling_strategy', nullable: true })
    schedulingStrategy!: string | null;

    /**


     * IDs dos Security Groups no banco de dados, resolvidos a partir do networkConfiguration.


     * Preenchido durante o sync para serviços com modo de rede awsvpc.


     */

    @Column('uuid', { array: true, name: 'security_group_ids', nullable: true })
    securityGroupIds!: string[] | null;

    /**


     * Circuit breaker habilitado.


     */

    @Column({ type: 'boolean', name: 'enable_circuit_breaker', default: false })
    enableCircuitBreaker!: boolean;

    /**


     * ECS managed tags habilitadas.


     */

    @Column({ type: 'boolean', name: 'enable_ecs_managed_tags', default: false })
    enableEcsManagedTags!: boolean;

    /**


     * Tags do serviço (JSON).


     */

    @Column({ type: 'jsonb', default: {} })
    tags!: Record<string, string>;

    /**


     * Data de criação do serviço na AWS.


     */

    @Column({ type: 'timestamptz', name: 'created_at_aws', nullable: true })
    createdAtAws!: Date | null;

    /**


     * Usuário que criou o serviço.


     */

    @Column({ type: 'varchar', length: 255, name: 'created_by', nullable: true })
    createdBy!: string | null;

    /**


     * Data e hora da última sincronização com a AWS.


     */

    @Column({ type: 'timestamptz', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    // ========== RELAÇÕES ==========

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @ManyToOne(() => AwsEcsCluster, (cluster) => cluster.services, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cluster_id' })
    cluster!: AwsEcsCluster;

    @ManyToOne(() => AwsEcsTaskDefinition, (taskDefinition) => taskDefinition.services, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'task_definition_id' })
    taskDefinition!: AwsEcsTaskDefinition;

    @ManyToOne(() => AwsIamRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'service_role_id' })
    serviceRole!: AwsIamRole | null;

    // ========== TIMESTAMPS ==========

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
    updatedAt!: Date;
}
