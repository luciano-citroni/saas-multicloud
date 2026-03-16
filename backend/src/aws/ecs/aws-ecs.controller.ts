import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { EcsService } from './aws-ecs.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import {
    EcsClusterResponseDto,
    EcsTaskDefinitionResponseDto,
    EcsServiceResponseDto,
    EcsClusterSyncResponseDto,
    EcsTaskDefinitionSyncResponseDto,
    EcsServiceSyncResponseDto,
} from './swagger.dto';

@ApiTags('AWS ECS')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/ecs')
export class AwsEcsController {
    constructor(private readonly service: EcsService) {}

    // =========================================================================

    // Clusters ECS - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/clusters')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar clusters ECS do banco de dados',

        description: 'Retorna os clusters ECS sincronizados e armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Lista de clusters ECS do banco de dados',

        type: [EcsClusterResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listClustersFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/clusters/:clusterId')
    @ApiOperation({
        summary: 'Buscar cluster ECS por ID',

        description: 'Retorna os detalhes de um cluster ECS específico.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'clusterId', type: 'string', format: 'uuid', description: 'UUID do cluster no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes do cluster ECS',

        type: EcsClusterResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Cluster não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getCluster(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('clusterId', ParseUUIDPipe) clusterId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getClusterById(clusterId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/clusters/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar clusters ECS da AWS',

        description: 'Busca os clusters ECS da AWS e armazena/atualiza no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Clusters ECS sincronizados com sucesso',

        type: [EcsClusterSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Falha ao sincronizar clusters' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncClustersFromAws(cloudAccountId, org.id);
    }

    // =========================================================================

    // Task Definitions ECS - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/task-definitions')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar task definitions ECS do banco de dados',

        description: 'Retorna as task definitions ECS sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'family', required: false, description: 'Filtrar por família de task definition', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Lista de task definitions ECS do banco de dados',

        type: [EcsTaskDefinitionResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listTaskDefinitions(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Query('family') family: string | undefined,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.listTaskDefinitionsFromDatabase(cloudAccountId, family);
    }

    @Get('accounts/:cloudAccountId/task-definitions/:taskDefinitionId')
    @ApiOperation({
        summary: 'Buscar task definition ECS por ID',

        description: 'Retorna os detalhes de uma task definition ECS específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'taskDefinitionId', type: 'string', format: 'uuid', description: 'UUID da task definition no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes da task definition ECS',

        type: EcsTaskDefinitionResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Task definition não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getTaskDefinition(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('taskDefinitionId', ParseUUIDPipe) taskDefinitionId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getTaskDefinitionById(taskDefinitionId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/task-definitions/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar task definitions ECS da AWS',

        description:
            'Busca as task definitions ECS da AWS e armazena/atualiza no banco de dados. Use ?family= para sincronizar apenas uma família específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'family', required: false, description: 'Filtrar sincronização por família', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Task definitions ECS sincronizadas com sucesso',

        type: [EcsTaskDefinitionSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Falha ao sincronizar task definitions' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncTaskDefinitions(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Query('family') family: string | undefined,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.syncTaskDefinitionsFromAws(cloudAccountId, org.id, family);
    }

    // =========================================================================

    // Serviços ECS - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/services')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar serviços ECS do banco de dados',

        description: 'Retorna os serviços ECS sincronizados e armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'clusterId', required: false, description: 'Filtrar por cluster ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Lista de serviços ECS do banco de dados',

        type: [EcsServiceResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listServices(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Query('clusterId') clusterId: string | undefined,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.listServicesFromDatabase(cloudAccountId, clusterId);
    }

    @Get('accounts/:cloudAccountId/services/:serviceId')
    @ApiOperation({
        summary: 'Buscar serviço ECS por ID',

        description: 'Retorna os detalhes de um serviço ECS específico.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'serviceId', type: 'string', format: 'uuid', description: 'UUID do serviço no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes do serviço ECS',

        type: EcsServiceResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Serviço não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getService(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('serviceId', ParseUUIDPipe) serviceId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getServiceById(serviceId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/services/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar serviços ECS da AWS',

        description: 'Busca os serviços ECS da AWS e armazena/atualiza no banco de dados. Use ?clusterId= para sincronizar apenas um cluster específico.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'clusterId', required: false, description: 'Filtrar sincronização por cluster ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Serviços ECS sincronizados com sucesso',

        type: [EcsServiceSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Falha ao sincronizar serviços' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncServices(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Query('clusterId') clusterId: string | undefined,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.syncServicesFromAws(cloudAccountId, org.id, clusterId);
    }
}
