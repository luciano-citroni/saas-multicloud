import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsApiGatewayService } from './aws-api-gateway.service';

import { ApiGatewayRestApiResponseDto, ApiGatewayRestApiSyncResponseDto, ApiGatewayRestApiWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS API Gateway')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/api-gateway')
export class AwsApiGatewayController {
    constructor(private readonly service: AwsApiGatewayService) {}

    @Get('accounts/:cloudAccountId/rest-apis')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar REST APIs do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [ApiGatewayRestApiResponseDto] })
    listApis(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listApisFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/rest-apis/:apiId')
    @ApiOperation({ summary: 'Buscar REST API por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'apiId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: ApiGatewayRestApiWithRelationsResponseDto })
    @ApiResponse({ status: 400, description: 'API não encontrada' })
    getApi(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('apiId', ParseUUIDPipe) apiId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getApiById(apiId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/rest-apis/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar REST APIs do API Gateway da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [ApiGatewayRestApiSyncResponseDto] })
    syncApis(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncApisFromAws(cloudAccountId, org.id);
    }
}
