import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { Ec2Service } from './aws-ec2.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { Ec2InstanceResponseDto, Ec2SyncResponseDto, Ec2WithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS EC2')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/ec2')
export class Ec2Controller {
    constructor(private readonly service: Ec2Service) {}

    // =========================================================================

    // Instancias EC2 - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/instances')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Instancias EC2 do banco de dados',

        description: 'Retorna as Instancias EC2 sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Instancias EC2 do banco de dados',

        type: [Ec2InstanceResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listInstances(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listInstancesFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/vpcs/:vpcId/instances')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Instancias EC2 de uma VPC específica',

        description: 'Retorna as Instancias EC2 de uma VPC específica armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'vpcId', type: 'string', format: 'uuid', description: 'UUID da VPC no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Instancias EC2 da VPC',

        type: [Ec2InstanceResponseDto],
    })
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
        summary: 'Buscar Instancias EC2 por ID',

        description: 'Retorna os detalhes de uma Instancias EC2 específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'instanceId', type: 'string', format: 'uuid', description: 'UUID da Instancias no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes da Instancias EC2',

        type: Ec2WithRelationsResponseDto,
    })
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
        summary: 'Sincronizar Instancias EC2 da AWS',

        description: 'Busca as Instancias EC2 da AWS e armazena/atualiza no banco de dados. Use ?vpcId= para sincronizar apenas uma VPC específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar sync por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Instancias EC2 sincronizadas com sucesso',

        type: [Ec2SyncResponseDto],
    })
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
