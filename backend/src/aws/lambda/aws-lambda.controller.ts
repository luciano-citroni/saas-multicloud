import { RolesGuard } from '../../rbac/roles.guard';
import { CloudAccountAccessGuard } from '../../cloud/cloud-account-access.guard';
import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';
import { parsePaginationQuery } from '../../common/pagination/parse-pagination-query';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Tenant } from '../../db/entites/tenant.entity';

import { AwsLambdaService } from './aws-lambda.service';

import { LambdaFunctionResponseDto, LambdaFunctionSyncResponseDto, LambdaFunctionWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS Lambda')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('aws/lambda')
export class AwsLambdaController {
    constructor(private readonly service: AwsLambdaService) {}

    @Get('accounts/:cloudAccountId/functions')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar funções Lambda do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [LambdaFunctionResponseDto] })
    listFunctions(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        return this.service.listFunctionsFromDatabase(cloudAccountId, parsePaginationQuery(page, limit));
    }

    @Get('accounts/:cloudAccountId/functions/:functionId')
    @ApiOperation({ summary: 'Buscar função Lambda por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'functionId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: LambdaFunctionWithRelationsResponseDto })
    @ApiResponse({ status: 400, description: 'Função não encontrada' })
    getFunction(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('functionId', ParseUUIDPipe) functionId: string,

        @CurrentOrganization() org: Tenant
    ) {
        return this.service.getFunctionById(functionId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/functions/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar funções Lambda da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [LambdaFunctionSyncResponseDto] })
    syncFunctions(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncFunctionsFromAws(cloudAccountId, org.id);
    }
}
