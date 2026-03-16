import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsLambdaService } from './aws-lambda.service';

import { LambdaFunctionResponseDto, LambdaFunctionSyncResponseDto, LambdaFunctionWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS Lambda')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/lambda')
export class AwsLambdaController {
    constructor(private readonly service: AwsLambdaService) {}

    @Get('accounts/:cloudAccountId/functions')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar funções Lambda do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [LambdaFunctionResponseDto] })
    listFunctions(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listFunctionsFromDatabase(cloudAccountId);
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

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getFunctionById(functionId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/functions/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar funções Lambda da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [LambdaFunctionSyncResponseDto] })
    syncFunctions(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncFunctionsFromAws(cloudAccountId, org.id);
    }
}
