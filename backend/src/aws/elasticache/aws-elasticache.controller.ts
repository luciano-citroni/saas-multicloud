import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsElastiCacheService } from './aws-elasticache.service';

import { ElastiCacheClusterResponseDto, ElastiCacheClusterSyncResponseDto, ElastiCacheClusterWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS ElastiCache')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/elasticache')
export class AwsElastiCacheController {
    constructor(private readonly service: AwsElastiCacheService) {}

    @Get('accounts/:cloudAccountId/clusters')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar clusters ElastiCache do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [ElastiCacheClusterResponseDto] })
    listClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listClustersFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/clusters/:clusterId')
    @ApiOperation({ summary: 'Buscar cluster ElastiCache por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'clusterId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: ElastiCacheClusterWithRelationsResponseDto })
    @ApiResponse({ status: 400, description: 'Cluster não encontrado' })
    getCluster(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('clusterId', ParseUUIDPipe) clusterId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getClusterById(clusterId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/clusters/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar clusters ElastiCache da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [ElastiCacheClusterSyncResponseDto] })
    syncClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncClustersFromAws(cloudAccountId, org.id);
    }
}
