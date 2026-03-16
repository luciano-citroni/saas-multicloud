import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { CloudAccount } from './cloud-account.entity';

import { AwsEcsService } from './aws-ecs-service.entity';

/**


 * Status possíveis de um cluster ECS.


 */

export enum EcsClusterStatus {
    ACTIVE = 'ACTIVE',

    PROVISIONING = 'PROVISIONING',

    DEPROVISIONING = 'DEPROVISIONING',

    FAILED = 'FAILED',

    INACTIVE = 'INACTIVE',
}

/**


 * Representa um cluster ECS (Elastic Container Service) da Amazon Web Services.


 *


 * Isolamento de tenant:


 * - O cluster pertence a uma CloudAccount, que pertence a uma organização.


 * - Sempre filtrar por cloudAccount.organizationId para garantir isolamento.


 */

@Entity('aws_ecs_clusters')
export class AwsEcsCluster {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    /**


     * ID da conta cloud à qual este cluster pertence.


     */

    @Column({ type: 'uuid', name: 'cloud_account_id' })
    cloudAccountId!: string;

    /**


     * ARN do cluster na AWS.


     */

    @Column({ type: 'varchar', length: 255, name: 'cluster_arn', unique: true })
    clusterArn!: string;

    /**


     * Nome do cluster.


     */

    @Column({ type: 'varchar', length: 255, name: 'cluster_name' })
    clusterName!: string;

    /**


     * Status do cluster (ACTIVE, PROVISIONING, etc).


     */

    @Column({ type: 'varchar', length: 50 })
    status!: string;

    /**


     * Número de tasks registradas no cluster.


     */

    @Column({ type: 'int', name: 'registered_container_instances_count', default: 0 })
    registeredContainerInstancesCount!: number;

    /**


     * Número de tasks em execução no cluster.


     */

    @Column({ type: 'int', name: 'running_tasks_count', default: 0 })
    runningTasksCount!: number;

    /**


     * Número de tasks pendentes no cluster.


     */

    @Column({ type: 'int', name: 'pending_tasks_count', default: 0 })
    pendingTasksCount!: number;

    /**


     * Número de serviços ativos no cluster.


     */

    @Column({ type: 'int', name: 'active_services_count', default: 0 })
    activeServicesCount!: number;

    /**


     * Tags do cluster (JSON).


     */

    @Column({ type: 'jsonb', default: {} })
    tags!: Record<string, string>;

    /**


     * Configurações de capacidade do cluster (JSON).


     */

    @Column({ type: 'jsonb', nullable: true, name: 'capacity_providers' })
    capacityProviders!: string[] | null;

    /**


     * Estratégia padrão de provisionamento de capacidade.


     */

    @Column({ type: 'jsonb', nullable: true, name: 'default_capacity_provider_strategy' })
    defaultCapacityProviderStrategy!: Record<string, any>[] | null;

    /**


     * Data e hora da última sincronização com a AWS.


     */

    @Column({ type: 'timestamptz', name: 'last_synced_at', nullable: true })
    lastSyncedAt!: Date | null;

    // ========== RELAÇÕES ==========

    @ManyToOne(() => CloudAccount, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cloud_account_id' })
    cloudAccount!: CloudAccount;

    @OneToMany(() => AwsEcsService, (service) => service.cluster)
    services!: AwsEcsService[];

    // ========== TIMESTAMPS ==========

    @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
    updatedAt!: Date;
}
