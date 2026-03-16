import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { AwsRdsService } from './aws-rds.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { RdsInstanceResponseDto, RdsSyncResponseDto } from './swagger.dto';

@ApiTags('AWS RDS')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/rds')
export class AwsRdsController {
    constructor(private readonly service: AwsRdsService) {}

    @Get('accounts/:cloudAccountId/instances')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Instanciass RDS do banco de dados',

        description: 'Retorna as Instanciass RDS sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de Instanciass RDS do banco de dados', type: [RdsInstanceResponseDto] })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listInstances(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listInstancesFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/vpcs/:vpcId/instances')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Instanciass RDS de uma VPC específica',

        description: 'Retorna as Instanciass RDS de uma VPC específica armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'vpcId', type: 'string', format: 'uuid', description: 'UUID da VPC no banco de dados' })
    @ApiResponse({ status: 200, description: 'Lista de Instanciass RDS da VPC', type: [RdsInstanceResponseDto] })
    @ApiResponse({ status: 400, description: 'VPC não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listInstancesByVpc(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('vpcId', ParseUUIDPipe) vpcId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.listInstancesByVpcFromDatabase(vpcId, cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/instances/:instanceId')
    @ApiOperation({
        summary: 'Buscar Instancias RDS por ID',

        description: 'Retorna os detalhes de uma Instancias RDS específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'instanceId', type: 'string', format: 'uuid', description: 'UUID da Instancias no banco de dados' })
    @ApiResponse({ status: 200, description: 'Detalhes da Instancias RDS', type: RdsInstanceResponseDto })
    @ApiResponse({ status: 400, description: 'Instancias não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getInstance(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('instanceId', ParseUUIDPipe) instanceId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getInstanceById(instanceId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/instances/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar Instanciass RDS da AWS',

        description:
            'Busca as Instanciass RDS da AWS e armazena/atualiza no banco de dados. Use ?vpcId= para sincronizar apenas uma VPC específica (UUID da VPC no banco).',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar sync por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({ status: 200, description: 'Instanciass RDS sincronizadas com sucesso', type: [RdsSyncResponseDto] })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncInstances(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Organization,

        @Query('vpcId') vpcId?: string
    ) {
        return this.service.syncInstancesFromAws(cloudAccountId, org.id, vpcId);
    }
}
