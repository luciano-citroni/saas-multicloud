import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsRoute53Service } from './aws-route53.service';

import { Route53HostedZoneResponseDto, Route53HostedZoneSyncResponseDto, Route53HostedZoneWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS Route53')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/route53')
export class AwsRoute53Controller {
    constructor(private readonly service: AwsRoute53Service) {}

    @Get('accounts/:cloudAccountId/hosted-zones')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar hosted zones do banco de dados',
        description: 'Retorna as hosted zones Route53 sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [Route53HostedZoneResponseDto] })
    listHostedZones(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listHostedZonesFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/hosted-zones/:hostedZoneId')
    @ApiOperation({ summary: 'Buscar hosted zone por ID', description: 'Retorna os detalhes de uma hosted zone específica.' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'hostedZoneId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: Route53HostedZoneWithRelationsResponseDto })
    @ApiResponse({ status: 400, description: 'Hosted Zone não encontrada' })
    getHostedZone(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('hostedZoneId', ParseUUIDPipe) hostedZoneId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getHostedZoneById(hostedZoneId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/hosted-zones/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar hosted zones da AWS', description: 'Busca as hosted zones do Route53 e armazena/atualiza no banco de dados.' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [Route53HostedZoneSyncResponseDto] })
    syncHostedZones(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncHostedZonesFromAws(cloudAccountId, org.id);
    }
}
