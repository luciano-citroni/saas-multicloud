import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ECSClient,
    DescribeClustersCommand,
    DescribeTaskDefinitionCommand,
    DescribeServicesCommand,
    ListClustersCommand,
    ListTaskDefinitionsCommand,
    ListServicesCommand,
    type Cluster,
    type TaskDefinition,
    type Service as EcsServiceType,
} from '@aws-sdk/client-ecs';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsEcsCluster, AwsEcsTaskDefinition, AwsEcsService as AwsEcsServiceEntity, AwsSecurityGroup, AwsIamRole } from '../../db/entites/index';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

@Injectable()
export class EcsService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsEcsCluster)
        private readonly clusterRepository: Repository<AwsEcsCluster>,
        @InjectRepository(AwsEcsTaskDefinition)
        private readonly taskDefinitionRepository: Repository<AwsEcsTaskDefinition>,
        @InjectRepository(AwsEcsServiceEntity)
        private readonly serviceRepository: Repository<AwsEcsServiceEntity>,
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepository: Repository<CloudAccount>,
        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>,
        @InjectRepository(AwsIamRole)
        private readonly iamRoleRepository: Repository<AwsIamRole>
    ) {}

    // =========================================================================
    // Listar dados do BANCO DE DADOS (sem consultar AWS)
    // =========================================================================

    /**
     * Lista clusters ECS armazenados no banco de dados para uma CloudAccount específica.
     */
    async listClustersFromDatabase(cloudAccountId: string) {
        const clusters = await this.clusterRepository
            .createQueryBuilder('cluster')
            .where('cluster.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('cluster.clusterName', 'ASC')
            .getMany();

        return clusters.map(mapDbCluster);
    }

    /**
     * Busca um cluster ECS específico pelo ID.
     */
    async getClusterById(clusterId: string, cloudAccountId: string) {
        const cluster = await this.clusterRepository
            .createQueryBuilder('cluster')
            .where('cluster.id = :clusterId', { clusterId })
            .andWhere('cluster.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!cluster) {
            throw new BadRequestException(`Cluster ECS com ID "${clusterId}" não encontrado.`);
        }

        return mapDbCluster(cluster);
    }

    /**
     * Lista task definitions armazenadas no banco de dados para uma CloudAccount específica.
     */
    async listTaskDefinitionsFromDatabase(cloudAccountId: string, family?: string) {
        const query = this.taskDefinitionRepository.createQueryBuilder('taskDef').where('taskDef.cloudAccountId = :cloudAccountId', { cloudAccountId });

        if (family) {
            query.andWhere('taskDef.family = :family', { family });
        }

        const taskDefs = await query.orderBy('taskDef.family', 'ASC').addOrderBy('taskDef.revision', 'DESC').getMany();

        return taskDefs.map(mapDbTaskDefinition);
    }

    /**
     * Busca uma task definition específica pelo ID.
     */
    async getTaskDefinitionById(taskDefinitionId: string, cloudAccountId: string) {
        const taskDef = await this.taskDefinitionRepository
            .createQueryBuilder('taskDef')
            .where('taskDef.id = :taskDefinitionId', { taskDefinitionId })
            .andWhere('taskDef.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!taskDef) {
            throw new BadRequestException(`Task Definition ECS com ID "${taskDefinitionId}" não encontrada.`);
        }

        return mapDbTaskDefinition(taskDef);
    }

    /**
     * Lista serviços ECS armazenados no banco de dados para uma CloudAccount específica.
     */
    async listServicesFromDatabase(cloudAccountId: string, clusterId?: string) {
        const query = this.serviceRepository
            .createQueryBuilder('service')
            .leftJoinAndSelect('service.cluster', 'cluster')
            .leftJoinAndSelect('service.taskDefinition', 'taskDef')
            .where('service.cloudAccountId = :cloudAccountId', { cloudAccountId });

        if (clusterId) {
            query.andWhere('service.clusterId = :clusterId', { clusterId });
        }

        const services = await query.orderBy('service.serviceName', 'ASC').getMany();

        return services.map(mapDbService);
    }

    /**
     * Busca um serviço ECS específico pelo ID.
     */
    async getServiceById(serviceId: string, cloudAccountId: string) {
        const service = await this.serviceRepository
            .createQueryBuilder('service')
            .leftJoinAndSelect('service.cluster', 'cluster')
            .leftJoinAndSelect('service.taskDefinition', 'taskDef')
            .where('service.id = :serviceId', { serviceId })
            .andWhere('service.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!service) {
            throw new BadRequestException(`Serviço ECS com ID "${serviceId}" não encontrado.`);
        }

        return mapDbService(service);
    }

    // =========================================================================
    // Sincronizar dados da AWS com o BANCO DE DADOS
    // =========================================================================

    /**
     * Sincroniza clusters ECS da AWS e armazena no banco de dados.
     */
    async syncClustersFromAws(cloudAccountId: string, organizationId: string) {
        const ecs = await this.connector.getEcsClient(cloudAccountId, organizationId);

        // Lista todos os ARNs dos clusters
        const { clusterArns } = await ecs.send(new ListClustersCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar clusters ECS na AWS. Verifique as permissões da role (ecs:ListClusters).');
        });

        if (!clusterArns || clusterArns.length === 0) {
            return [];
        }

        // Descreve os clusters em detalhes
        const { clusters } = await ecs.send(new DescribeClustersCommand({ clusters: clusterArns, include: ['TAGS'] })).catch(() => {
            throw new BadRequestException('Falha ao descrever clusters ECS na AWS. Verifique as permissões da role (ecs:DescribeClusters).');
        });

        const mappedClusters = (clusters ?? []).map(mapAwsCluster);
        const now = new Date();

        for (const clusterData of mappedClusters) {
            let dbCluster = await this.clusterRepository.findOne({
                where: { clusterArn: clusterData.clusterArn },
            });

            if (dbCluster) {
                // Atualiza cluster existente
                dbCluster.clusterName = clusterData.clusterName;
                dbCluster.status = clusterData.status;
                dbCluster.registeredContainerInstancesCount = clusterData.registeredContainerInstancesCount ?? 0;
                dbCluster.runningTasksCount = clusterData.runningTasksCount ?? 0;
                dbCluster.pendingTasksCount = clusterData.pendingTasksCount ?? 0;
                dbCluster.activeServicesCount = clusterData.activeServicesCount ?? 0;
                dbCluster.tags = clusterData.tags;
                dbCluster.capacityProviders = clusterData.capacityProviders;
                dbCluster.defaultCapacityProviderStrategy = clusterData.defaultCapacityProviderStrategy;
                dbCluster.lastSyncedAt = now;
            } else {
                // Cria novo cluster
                const newCluster: Partial<AwsEcsCluster> = {
                    cloudAccountId,
                    clusterArn: clusterData.clusterArn,
                    clusterName: clusterData.clusterName,
                    status: clusterData.status,
                    registeredContainerInstancesCount: clusterData.registeredContainerInstancesCount ?? 0,
                    runningTasksCount: clusterData.runningTasksCount ?? 0,
                    pendingTasksCount: clusterData.pendingTasksCount ?? 0,
                    activeServicesCount: clusterData.activeServicesCount ?? 0,
                    tags: clusterData.tags,
                    capacityProviders: clusterData.capacityProviders,
                    defaultCapacityProviderStrategy: clusterData.defaultCapacityProviderStrategy,
                    lastSyncedAt: now,
                };
                dbCluster = this.clusterRepository.create(newCluster);
            }

            await this.clusterRepository.save(dbCluster);
        }

        return mappedClusters;
    }

    /**
     * Sincroniza task definitions ECS da AWS e armazena no banco de dados.
     */
    async syncTaskDefinitionsFromAws(cloudAccountId: string, organizationId: string, family?: string) {
        const ecs = await this.connector.getEcsClient(cloudAccountId, organizationId);

        // Lista apenas as últimas versões das task definitions
        const { taskDefinitionArns } = await ecs
            .send(
                new ListTaskDefinitionsCommand({
                    familyPrefix: family,
                    status: 'ACTIVE',
                    sort: 'DESC', // Ordena por versão descendente (mais recente primeiro)
                    maxResults: family ? undefined : 100, // Limite razoável quando buscar todas
                })
            )
            .catch(() => {
                throw new BadRequestException('Falha ao listar task definitions ECS na AWS. Verifique as permissões da role (ecs:ListTaskDefinitions).');
            });

        if (!taskDefinitionArns || taskDefinitionArns.length === 0) {
            return [];
        }

        // Filtra para manter apenas a última versão de cada família
        const latestByFamily = new Map<string, string>();
        for (const arn of taskDefinitionArns) {
            // ARN format: arn:aws:ecs:region:account:task-definition/family:revision
            const parts = arn.split('/')[1].split(':');
            const familyName = parts[0];

            if (!latestByFamily.has(familyName)) {
                latestByFamily.set(familyName, arn);
            }
        }

        const latestTaskDefArns = Array.from(latestByFamily.values());
        const now = new Date();
        const mappedTaskDefs: any[] = [];

        // Descreve apenas as últimas task definitions
        for (const taskDefArn of latestTaskDefArns) {
            const { taskDefinition } = await ecs
                .send(new DescribeTaskDefinitionCommand({ taskDefinition: taskDefArn, include: ['TAGS'] }))
                .catch((error: any) => {
                    throw new BadRequestException(`Falha ao descrever task definition ${taskDefArn}: ${error.message || error.toString()}`);
                });

            if (!taskDefinition) continue;

            const taskDefData = mapAwsTaskDefinition(taskDefinition);
            mappedTaskDefs.push(taskDefData);

            // Resolve IAM Roles no banco de dados
            let executionRoleId: string | null = null;
            let taskRoleId: string | null = null;

            if (taskDefData.executionRoleArn) {
                const executionRole = await this.iamRoleRepository.findOne({
                    where: { cloudAccountId, roleArn: taskDefData.executionRoleArn },
                });
                if (!executionRole) {
                    console.warn(`Execution Role ${taskDefData.executionRoleArn} não encontrada no banco. Sincronize as IAM Roles primeiro.`);
                }
                executionRoleId = executionRole?.id ?? null;
            }

            if (taskDefData.taskRoleArn) {
                const taskRole = await this.iamRoleRepository.findOne({
                    where: { cloudAccountId, roleArn: taskDefData.taskRoleArn },
                });
                if (!taskRole) {
                    console.warn(`Task Role ${taskDefData.taskRoleArn} não encontrada no banco. Sincronize as IAM Roles primeiro.`);
                }
                taskRoleId = taskRole?.id ?? null;
            }

            let dbTaskDef = await this.taskDefinitionRepository.findOne({
                where: { taskDefinitionArn: taskDefData.taskDefinitionArn },
            });

            if (dbTaskDef) {
                // Atualiza task definition existente
                dbTaskDef.family = taskDefData.family;
                dbTaskDef.revision = taskDefData.revision;
                dbTaskDef.status = taskDefData.status;
                dbTaskDef.executionRoleArn = taskDefData.executionRoleArn;
                dbTaskDef.taskRoleArn = taskDefData.taskRoleArn;
                dbTaskDef.networkMode = taskDefData.networkMode;
                dbTaskDef.cpu = taskDefData.cpu;
                dbTaskDef.memory = taskDefData.memory;
                dbTaskDef.requiresCompatibilities = taskDefData.requiresCompatibilities;
                dbTaskDef.containerDefinitions = taskDefData.containerDefinitions;
                dbTaskDef.volumes = taskDefData.volumes;
                dbTaskDef.placementConstraints = taskDefData.placementConstraints;
                dbTaskDef.runtimePlatform = taskDefData.runtimePlatform;
                dbTaskDef.ephemeralStorage = taskDefData.ephemeralStorage;
                dbTaskDef.tags = taskDefData.tags;
                dbTaskDef.registeredAt = taskDefData.registeredAt;
                dbTaskDef.registeredBy = taskDefData.registeredBy;
                dbTaskDef.executionRoleId = executionRoleId;
                dbTaskDef.taskRoleId = taskRoleId;
                dbTaskDef.lastSyncedAt = now;
            } else {
                // Cria nova task definition
                const newTaskDef: Partial<AwsEcsTaskDefinition> = {
                    cloudAccountId,
                    taskDefinitionArn: taskDefData.taskDefinitionArn,
                    family: taskDefData.family,
                    revision: taskDefData.revision,
                    status: taskDefData.status,
                    executionRoleArn: taskDefData.executionRoleArn,
                    taskRoleArn: taskDefData.taskRoleArn,
                    networkMode: taskDefData.networkMode,
                    cpu: taskDefData.cpu,
                    memory: taskDefData.memory,
                    requiresCompatibilities: taskDefData.requiresCompatibilities,
                    containerDefinitions: taskDefData.containerDefinitions,
                    volumes: taskDefData.volumes,
                    placementConstraints: taskDefData.placementConstraints,
                    runtimePlatform: taskDefData.runtimePlatform,
                    ephemeralStorage: taskDefData.ephemeralStorage,
                    tags: taskDefData.tags,
                    registeredAt: taskDefData.registeredAt,
                    registeredBy: taskDefData.registeredBy,
                    executionRoleId,
                    taskRoleId,
                    lastSyncedAt: now,
                };
                dbTaskDef = this.taskDefinitionRepository.create(newTaskDef);
            }

            await this.taskDefinitionRepository.save(dbTaskDef);
        }

        return mappedTaskDefs;
    }

    /**
     * Sincroniza serviços ECS da AWS e armazena no banco de dados.
     */
    async syncServicesFromAws(cloudAccountId: string, organizationId: string, clusterId?: string) {
        const ecs = await this.connector.getEcsClient(cloudAccountId, organizationId);

        let clusterArns: string[] = [];

        if (clusterId) {
            // Busca um cluster específico
            const dbCluster = await this.clusterRepository.findOne({ where: { id: clusterId } });
            if (!dbCluster) {
                throw new BadRequestException('Cluster não encontrado no banco de dados.');
            }
            clusterArns = [dbCluster.clusterArn];
        } else {
            // Lista todos os clusters
            const { clusterArns: arns } = await ecs.send(new ListClustersCommand({})).catch((error: any) => {
                console.error('Erro ao listar clusters ECS:', error.message || error);
                throw new BadRequestException('Falha ao listar clusters ECS na AWS.');
            });
            clusterArns = arns ?? [];
        }

        const now = new Date();
        const allMappedServices: any[] = [];

        for (const clusterArn of clusterArns) {
            // Lista serviços do cluster
            const { serviceArns } = await ecs.send(new ListServicesCommand({ cluster: clusterArn })).catch((error: any) => {
                throw new BadRequestException(`Falha ao listar serviços do cluster ${clusterArn}: ${error.message || error.toString()}`);
            });

            if (!serviceArns || serviceArns.length === 0) continue;

            // Descreve os serviços
            const { services } = await ecs
                .send(new DescribeServicesCommand({ cluster: clusterArn, services: serviceArns, include: ['TAGS'] }))
                .catch((error: any) => {
                    throw new BadRequestException(`Falha ao descrever serviços do cluster ${clusterArn}: ${error.message || error.toString()}`);
                });

            if (!services || services.length === 0) continue;

            for (const service of services) {
                const serviceData = mapAwsService(service);
                allMappedServices.push(serviceData);

                // Busca o cluster no banco de dados
                const dbCluster = await this.clusterRepository.findOne({
                    where: { clusterArn: serviceData.clusterArn },
                });

                if (!dbCluster) {
                    console.warn(`Cluster ${serviceData.clusterArn} não encontrado. Pulando serviço ${serviceData.serviceName}.`);
                    continue;
                }

                // Busca a task definition no banco de dados
                const dbTaskDef = await this.taskDefinitionRepository.findOne({
                    where: { taskDefinitionArn: serviceData.taskDefinitionArn },
                });

                if (!dbTaskDef) {
                    console.warn(`Task definition ${serviceData.taskDefinitionArn} não encontrada. Pulando serviço ${serviceData.serviceName}.`);
                    continue;
                }

                // Resolve Security Group IDs do networkConfiguration (awsvpc)
                const awsSgIds: string[] = (serviceData.networkConfiguration as any)?.awsvpcConfiguration?.securityGroups ?? [];
                const securityGroupIds = await this.resolveSecurityGroupIds(cloudAccountId, awsSgIds);

                // Resolve IAM Service Role no banco de dados
                let serviceRoleId: string | null = null;
                if (serviceData.roleArn) {
                    const serviceRole = await this.iamRoleRepository.findOne({
                        where: { cloudAccountId, roleArn: serviceData.roleArn },
                    });
                    if (!serviceRole) {
                        console.warn(`Service Role ${serviceData.roleArn} não encontrada no banco. Sincronize as IAM Roles primeiro.`);
                    }
                    serviceRoleId = serviceRole?.id ?? null;
                }

                let dbService = await this.serviceRepository.findOne({
                    where: { serviceArn: serviceData.serviceArn },
                });

                if (dbService) {
                    // Atualiza serviço existente
                    dbService.clusterId = dbCluster.id;
                    dbService.taskDefinitionId = dbTaskDef.id;
                    dbService.serviceName = serviceData.serviceName;
                    dbService.clusterArn = serviceData.clusterArn;
                    dbService.taskDefinitionArn = serviceData.taskDefinitionArn;
                    dbService.status = serviceData.status;
                    dbService.desiredCount = serviceData.desiredCount;
                    dbService.runningCount = serviceData.runningCount;
                    dbService.pendingCount = serviceData.pendingCount;
                    dbService.launchType = serviceData.launchType;
                    dbService.capacityProviderStrategy = serviceData.capacityProviderStrategy;
                    dbService.platformVersion = serviceData.platformVersion;
                    dbService.platformFamily = serviceData.platformFamily;
                    dbService.roleArn = serviceData.roleArn;
                    dbService.deploymentConfiguration = serviceData.deploymentConfiguration;
                    dbService.deployments = serviceData.deployments;
                    dbService.networkConfiguration = serviceData.networkConfiguration;
                    dbService.securityGroupIds = securityGroupIds;
                    dbService.loadBalancers = serviceData.loadBalancers;
                    dbService.serviceRegistries = serviceData.serviceRegistries;
                    dbService.schedulingStrategy = serviceData.schedulingStrategy;
                    dbService.enableCircuitBreaker = serviceData.enableCircuitBreaker;
                    dbService.enableEcsManagedTags = serviceData.enableEcsManagedTags;
                    dbService.tags = serviceData.tags;
                    dbService.createdAtAws = serviceData.createdAtAws;
                    dbService.createdBy = serviceData.createdBy;
                    dbService.serviceRoleId = serviceRoleId;
                    dbService.lastSyncedAt = now;
                } else {
                    // Cria novo serviço
                    const newService: Partial<AwsEcsServiceEntity> = {
                        cloudAccountId,
                        clusterId: dbCluster.id,
                        taskDefinitionId: dbTaskDef.id,
                        serviceArn: serviceData.serviceArn,
                        serviceName: serviceData.serviceName,
                        clusterArn: serviceData.clusterArn,
                        taskDefinitionArn: serviceData.taskDefinitionArn,
                        status: serviceData.status,
                        desiredCount: serviceData.desiredCount,
                        runningCount: serviceData.runningCount,
                        pendingCount: serviceData.pendingCount,
                        launchType: serviceData.launchType,
                        capacityProviderStrategy: serviceData.capacityProviderStrategy,
                        platformVersion: serviceData.platformVersion,
                        platformFamily: serviceData.platformFamily,
                        roleArn: serviceData.roleArn,
                        deploymentConfiguration: serviceData.deploymentConfiguration,
                        deployments: serviceData.deployments,
                        networkConfiguration: serviceData.networkConfiguration,
                        securityGroupIds,
                        loadBalancers: serviceData.loadBalancers,
                        serviceRegistries: serviceData.serviceRegistries,
                        schedulingStrategy: serviceData.schedulingStrategy,
                        enableCircuitBreaker: serviceData.enableCircuitBreaker,
                        enableEcsManagedTags: serviceData.enableEcsManagedTags,
                        tags: serviceData.tags,
                        createdAtAws: serviceData.createdAtAws,
                        createdBy: serviceData.createdBy,
                        serviceRoleId,
                        lastSyncedAt: now,
                    };
                    dbService = this.serviceRepository.create(newService);
                }

                await this.serviceRepository.save(dbService);
            }
        }

        return allMappedServices;
    }

    /**
     * Resolve uma lista de AWS Security Group IDs para UUIDs do banco de dados.
     */
    private async resolveSecurityGroupIds(cloudAccountId: string, awsSgIds: string[]): Promise<string[] | null> {
        if (awsSgIds.length === 0) return null;

        const ids: string[] = [];
        for (const awsSgId of awsSgIds) {
            const sg = await this.securityGroupRepository.findOne({
                where: { cloudAccountId, awsSecurityGroupId: awsSgId },
            });
            if (!sg) {
                console.warn(`Security Group ${awsSgId} não encontrado no banco. Sincronize os Security Groups primeiro.`);
                continue;
            }
            ids.push(sg.id);
        }

        return ids.length > 0 ? ids : null;
    }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function parseTags(tags: { key?: string; value?: string }[] | undefined): Record<string, string> {
    return (tags ?? []).reduce<Record<string, string>>((acc, { key, value }) => {
        if (key) acc[key] = value ?? '';
        return acc;
    }, {});
}

function mapAwsCluster(cluster: Cluster) {
    return {
        clusterArn: cluster.clusterArn!,
        clusterName: cluster.clusterName!,
        status: cluster.status ?? 'UNKNOWN',
        registeredContainerInstancesCount: cluster.registeredContainerInstancesCount ?? 0,
        runningTasksCount: cluster.runningTasksCount ?? 0,
        pendingTasksCount: cluster.pendingTasksCount ?? 0,
        activeServicesCount: cluster.activeServicesCount ?? 0,
        tags: parseTags(cluster.tags),
        capacityProviders: cluster.capacityProviders ?? null,
        defaultCapacityProviderStrategy: cluster.defaultCapacityProviderStrategy ?? null,
    };
}

function mapAwsTaskDefinition(taskDef: TaskDefinition) {
    return {
        taskDefinitionArn: taskDef.taskDefinitionArn!,
        family: taskDef.family!,
        revision: taskDef.revision!,
        status: taskDef.status ?? 'UNKNOWN',
        executionRoleArn: taskDef.executionRoleArn ?? null,
        taskRoleArn: taskDef.taskRoleArn ?? null,
        networkMode: taskDef.networkMode ?? null,
        cpu: taskDef.cpu ?? null,
        memory: taskDef.memory ?? null,
        requiresCompatibilities: taskDef.requiresCompatibilities ?? [],
        containerDefinitions: taskDef.containerDefinitions ?? [],
        volumes: taskDef.volumes ?? null,
        placementConstraints: taskDef.placementConstraints ?? null,
        runtimePlatform: taskDef.runtimePlatform ?? null,
        ephemeralStorage: taskDef.ephemeralStorage ?? null,
        tags: {}, // Tags são retornadas em um campo separado na API do ECS
        registeredAt: taskDef.registeredAt ?? null,
        registeredBy: taskDef.registeredBy ?? null,
    };
}

function mapAwsService(service: EcsServiceType) {
    const deploymentConfig = service.deploymentConfiguration;
    const enableCircuitBreaker = deploymentConfig?.deploymentCircuitBreaker?.enable ?? false;

    return {
        serviceArn: service.serviceArn!,
        serviceName: service.serviceName!,
        clusterArn: service.clusterArn!,
        taskDefinitionArn: service.taskDefinition!,
        status: service.status ?? 'UNKNOWN',
        desiredCount: service.desiredCount ?? 0,
        runningCount: service.runningCount ?? 0,
        pendingCount: service.pendingCount ?? 0,
        launchType: service.launchType ?? null,
        capacityProviderStrategy: service.capacityProviderStrategy ?? null,
        platformVersion: service.platformVersion ?? null,
        platformFamily: service.platformFamily ?? null,
        roleArn: service.roleArn ?? null,
        deploymentConfiguration: service.deploymentConfiguration ?? null,
        deployments: service.deployments ?? null,
        networkConfiguration: service.networkConfiguration ?? null,
        loadBalancers: service.loadBalancers ?? null,
        serviceRegistries: service.serviceRegistries ?? null,
        schedulingStrategy: service.schedulingStrategy ?? null,
        enableCircuitBreaker,
        enableEcsManagedTags: service.enableECSManagedTags ?? false,
        tags: parseTags(service.tags),
        createdAtAws: service.createdAt ?? null,
        createdBy: service.createdBy ?? null,
    };
}

function mapDbCluster(cluster: AwsEcsCluster) {
    return {
        id: cluster.id,
        cloudAccountId: cluster.cloudAccountId,
        clusterArn: cluster.clusterArn,
        clusterName: cluster.clusterName,
        status: cluster.status,
        registeredContainerInstancesCount: cluster.registeredContainerInstancesCount,
        runningTasksCount: cluster.runningTasksCount,
        pendingTasksCount: cluster.pendingTasksCount,
        activeServicesCount: cluster.activeServicesCount,
        tags: cluster.tags ?? {},
        capacityProviders: cluster.capacityProviders,
        defaultCapacityProviderStrategy: cluster.defaultCapacityProviderStrategy,
        lastSyncedAt: cluster.lastSyncedAt,
        createdAt: cluster.createdAt,
        updatedAt: cluster.updatedAt,
    };
}

function mapDbTaskDefinition(taskDef: AwsEcsTaskDefinition) {
    return {
        id: taskDef.id,
        cloudAccountId: taskDef.cloudAccountId,
        taskDefinitionArn: taskDef.taskDefinitionArn,
        family: taskDef.family,
        revision: taskDef.revision,
        status: taskDef.status,
        executionRoleArn: taskDef.executionRoleArn,
        executionRoleId: taskDef.executionRoleId,
        taskRoleArn: taskDef.taskRoleArn,
        taskRoleId: taskDef.taskRoleId,
        networkMode: taskDef.networkMode,
        cpu: taskDef.cpu,
        memory: taskDef.memory,
        requiresCompatibilities: taskDef.requiresCompatibilities,
        containerDefinitions: taskDef.containerDefinitions,
        volumes: taskDef.volumes,
        placementConstraints: taskDef.placementConstraints,
        runtimePlatform: taskDef.runtimePlatform,
        ephemeralStorage: taskDef.ephemeralStorage,
        tags: taskDef.tags ?? {},
        registeredAt: taskDef.registeredAt,
        registeredBy: taskDef.registeredBy,
        lastSyncedAt: taskDef.lastSyncedAt,
        createdAt: taskDef.createdAt,
        updatedAt: taskDef.updatedAt,
    };
}

function mapDbService(service: AwsEcsServiceEntity) {
    return {
        id: service.id,
        cloudAccountId: service.cloudAccountId,
        clusterId: service.clusterId,
        taskDefinitionId: service.taskDefinitionId,
        serviceArn: service.serviceArn,
        serviceName: service.serviceName,
        clusterArn: service.clusterArn,
        taskDefinitionArn: service.taskDefinitionArn,
        status: service.status,
        desiredCount: service.desiredCount,
        runningCount: service.runningCount,
        pendingCount: service.pendingCount,
        launchType: service.launchType,
        capacityProviderStrategy: service.capacityProviderStrategy,
        platformVersion: service.platformVersion,
        platformFamily: service.platformFamily,
        roleArn: service.roleArn,
        serviceRoleId: service.serviceRoleId,
        deploymentConfiguration: service.deploymentConfiguration,
        deployments: service.deployments,
        networkConfiguration: service.networkConfiguration,
        securityGroupIds: service.securityGroupIds ?? [],
        loadBalancers: service.loadBalancers,
        serviceRegistries: service.serviceRegistries,
        schedulingStrategy: service.schedulingStrategy,
        enableCircuitBreaker: service.enableCircuitBreaker,
        enableEcsManagedTags: service.enableEcsManagedTags,
        tags: service.tags ?? {},
        createdAtAws: service.createdAtAws,
        createdBy: service.createdBy,
        lastSyncedAt: service.lastSyncedAt,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        cluster: service.cluster ? mapDbCluster(service.cluster) : undefined,
        taskDefinition: service.taskDefinition ? mapDbTaskDefinition(service.taskDefinition) : undefined,
    };
}
