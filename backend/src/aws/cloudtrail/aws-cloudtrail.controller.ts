import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsCloudTrailService } from './aws-cloudtrail.service';

import { CloudTrailTrailResponseDto, CloudTrailTrailSyncResponseDto, CloudTrailTrailWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS CloudTrail')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/cloudtrail')
export class AwsCloudTrailController {
    constructor(private readonly service: AwsCloudTrailService) {}

    @Get('accounts/:cloudAccountId/trails')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar trails CloudTrail do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [CloudTrailTrailResponseDto] })
    listTrails(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listTrailsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/trails/:trailId')
    @ApiOperation({ summary: 'Buscar trail CloudTrail por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'trailId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: CloudTrailTrailWithRelationsResponseDto })
    @ApiResponse({ status: 400, description: 'Trail não encontrada' })
    getTrail(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('trailId', ParseUUIDPipe) trailId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getTrailById(trailId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/trails/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar trails CloudTrail da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [CloudTrailTrailSyncResponseDto] })
    syncTrails(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncTrailsFromAws(cloudAccountId, org.id);
    }
}
