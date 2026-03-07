import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CloudAccount } from './cloud-account.entity';
import { AwsEcsService } from './aws-ecs-service.entity';
import { AwsIamRole } from './aws-iam-role.entity';

/**
 * Status possíveis de uma task definition ECS.
 */
export enum EcsTaskDefinitionStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    DELETE_IN_PROGRESS = 'DELETE_IN_PROGRESS',
}

/**
 * Tipos de compatibilidade da task definition.
 */
export enum EcsCompatibility {
    EC2 = 'EC2',
    FARGATE = 'FARGATE',
    EXTERNAL = 'EXTERNAL',
}

/**
 * Representa uma Task Definition do ECS (Elastic Container Service) da Amazon Web Services.
 *
 * Isolamento de tenant:
 * - A task definition pertence a uma CloudAccount, que pertence a uma organização.
 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.
 */
@Entity('aws_ecs_task_definitions')
export class AwsEcsTaskDefinition {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**
     * ID da conta cloud à qual esta task definition pertence.
     */
    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**
     * ARN da task definition na AWS.
     */
    @Column({ type: 'varchar', length: 512, name: 'task_definition_arn', unique: true })
    taskDefinitionArn!: string;

    /**
     * Família da task definition.
     */
    @Column({ type: 'varchar', length: 255 })
    family!: string;

    /**
     * Revisão da task definition.
     */
    @Column({ type: 'int' })
    revision!: number;

    /**
     * Status da task definition (ACTIVE, INACTIVE).
     */
    @Column({ type: 'varchar', length: 50 })
    status!: string;

    /**
     * ARN da role de execução da task.
     */
    @Column({ type: 'varchar', length: 255, name: 'execution_role_arn', nullable: true })
    executionRoleArn!: string | null;

    /**
     * ID da execution role IAM no banco de dados (FK para aws_iam_roles).
     */
    @Column({ type: 'uuid', name: 'execution_role_id', nullable: true })
    executionRoleId!: string | null;

    /**
     * ARN da role da task.
     */
    @Column({ type: 'varchar', length: 255, name: 'task_role_arn', nullable: true })
    taskRoleArn!: string | null;

    /**
     * ID da task role IAM no banco de dados (FK para aws_iam_roles).
     */
    @Column({ type: 'uuid', name: 'task_role_id', nullable: true })
    taskRoleId!: string | null;

    /**
     * Modo de rede da task (bridge, host, awsvpc, none).
     */
    @Column({ type: 'varchar', length: 50, name: 'network_mode', nullable: true })
    networkMode!: string | null;

    /**
     * CPU necessária para a task (256, 512, 1024, etc).
     */
    @Column({ type: 'varchar', length: 20, nullable: true })
    cpu!: string | null;

    /**
     * Memória necessária para a task (em MB).
     */
    @Column({ type: 'varchar', length: 20, nullable: true })
    memory!: string | null;

    /**
     * Tipos de compatibilidade (EC2, FARGATE, EXTERNAL).
     */
    @Column({ type: 'jsonb', name: 'requires_compatibilities' })
    requiresCompatibilities!: string[];

    /**
     * Definições de containers (JSON).
     */
    @Column({ type: 'jsonb', name: 'container_definitions' })
    containerDefinitions!: Record<string, any>[];

    /**
     * Definições de volumes (JSON).
     */
    @Column({ type: 'jsonb', nullable: true })
    volumes!: Record<string, any>[] | null;

    /**
     * Definições de placement constraints (JSON).
     */
    @Column({ type: 'jsonb', name: 'placement_constraints', nullable: true })
    placementConstraints!: Record<string, any>[] | null;

    /**
     * Configuração do runtime platform.
     */
    @Column({ type: 'jsonb', name: 'runtime_platform', nullable: true })
    runtimePlatform!: Record<string, any> | null;

    /**
     * Configuração da infraestrutura efêmera.
     */
    @Column({ type: 'jsonb', name: 'ephemeral_storage', nullable: true })
    ephemeralStorage!: Record<string, any> | null;

    /**
     * Tags da task definition (JSON).
     */
    @Column({ type: 'jsonb', default: {} })
    tags!: Record<string, string>;

    /**
     * Data de registro da task definition na AWS.
     */
    @Column({ type: 'timestamptz', name: 'registered_at', nullable: true })
    registeredAt!: Date | null;

    /**
     * Usuário que registrou a task definition.
     */
    @Column({ type: 'varchar', length: 255, name: 'registered_by', nullable: true })
    registeredBy!: string | null;

    /**
     * Data e hora da última sincronização com a AWS.
     */
    @Column({ type: 'timestamptz', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    // ========== RELAÇÕES ==========

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @OneToMany(() => AwsEcsService, (service) => service.taskDefinition)
    services!: AwsEcsService[];

    @ManyToOne(() => AwsIamRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'execution_role_id' })
    executionRole!: AwsIamRole | null;

    @ManyToOne(() => AwsIamRole, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'task_role_id' })
    taskRole!: AwsIamRole | null;

    // ========== TIMESTAMPS ==========

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
    updatedAt!: Date;
}
