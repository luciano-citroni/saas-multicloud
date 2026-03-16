import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { AwsNetworkingService } from './aws-networking.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { VpcResponseDto, SubnetResponseDto, VpcWithSubnetsResponseDto, VpcSyncResponseDto, SubnetSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Networking')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/networking')
export class AwsNetworkingController {
    constructor(private readonly service: AwsNetworkingService) {}

    // =========================================================================

    // VPCs - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/vpcs')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar VPCs do banco de dados',

        description: 'Retorna as VPCs sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Lista de VPCs do banco de dados',

        type: [VpcResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listVpcs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listVpcsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/vpcs/:vpcId')
    @ApiOperation({
        summary: 'Buscar VPC por ID com subnets',

        description: 'Retorna uma VPC específica com todas as suas subnets associadas.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'vpcId', type: 'string', format: 'uuid', description: 'UUID da VPC no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'VPC com suas subnets',

        type: VpcWithSubnetsResponseDto,
    })
    @ApiResponse({ status: 400, description: 'VPC não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getVpcWithSubnets(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('vpcId', ParseUUIDPipe) vpcId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getVpcWithSubnets(vpcId, cloudAccountId);
    }

    @HttpCode(200)
    @Post('accounts/:cloudAccountId/vpcs/sync')
    @ApiOperation({
        summary: 'Sincronizar VPCs da AWS',

        description: 'Busca as VPCs da AWS e armazena/atualiza no banco de dados. Retorna as VPCs sincronizadas.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'VPCs sincronizadas com sucesso',

        type: [VpcSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncVpcs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncVpcsFromAws(cloudAccountId, org.id);
    }

    // =========================================================================

    // Subnets - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/subnets')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Subnets do banco de dados',

        description: 'Retorna as Subnets sincronizadas e armazenadas no banco de dados. Use ?vpcId= para filtrar por VPC.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Subnets do banco de dados',

        type: [SubnetResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listSubnets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization, @Query('vpcId') vpcId?: string) {
        return this.service.listSubnetsFromDatabase(cloudAccountId, vpcId);
    }

    @Post('accounts/:cloudAccountId/subnets/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar Subnets da AWS',

        description: 'Busca as Subnets da AWS e armazena/atualiza no banco de dados. Use ?vpcId= para sincronizar apenas uma VPC específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar sync por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Subnets sincronizadas com sucesso',

        type: [SubnetSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncSubnets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization, @Query('vpcId') vpcId?: string) {
        return this.service.syncSubnetsFromAws(cloudAccountId, org.id, vpcId);
    }
}
