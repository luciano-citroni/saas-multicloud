import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { AwsLoadBalancerService } from './aws-load-balancer.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { LoadBalancerResponseDto, LoadBalancerSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Load Balancers')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/load-balancers')
export class AwsLoadBalancerController {
    constructor(private readonly service: AwsLoadBalancerService) {}

    // =========================================================================

    // Load Balancers - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Load Balancers do banco de dados',

        description: 'Retorna os Load Balancers sincronizados e armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Load Balancers do banco de dados',

        type: [LoadBalancerResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listLoadBalancers(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listLoadBalancersFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/vpcs/:vpcId')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Load Balancers de uma VPC específica',

        description: 'Retorna os Load Balancers de uma VPC específica armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'vpcId', type: 'string', format: 'uuid', description: 'UUID da VPC no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Load Balancers da VPC',

        type: [LoadBalancerResponseDto],
    })
    @ApiResponse({ status: 400, description: 'VPC não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listLoadBalancersByVpc(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('vpcId', ParseUUIDPipe) vpcId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.listLoadBalancersByVpcFromDatabase(vpcId, cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/load-balancers/:loadBalancerId')
    @ApiOperation({
        summary: 'Buscar Load Balancer por ID',

        description: 'Retorna os detalhes de um Load Balancer específico.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'loadBalancerId', type: 'string', format: 'uuid', description: 'UUID do Load Balancer no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes do Load Balancer',

        type: LoadBalancerResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Load Balancer não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getLoadBalancer(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('loadBalancerId', ParseUUIDPipe) loadBalancerId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getLoadBalancerById(loadBalancerId, cloudAccountId);
    }

    // =========================================================================

    // Sincronização AWS - Banco de Dados

    // =========================================================================

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar Load Balancers da AWS',

        description:
            'Busca os Load Balancers da AWS e armazena/atualiza no banco de dados. Use ?region= para especificar a região (se omitido, usa a região da conta).',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({
        name: 'region',

        required: false,

        description: 'Região AWS (ex: us-east-1). Se omitido, usa a região configurada na conta.',

        type: 'string',
    })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar sync por AWS VPC ID (ex: vpc-xxx)', type: 'string' })
    @ApiResponse({
        status: 200,

        description: 'Load Balancers sincronizados com sucesso',

        type: [LoadBalancerSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncLoadBalancers(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @CurrentOrganization() org: Organization,

        @Query('region') region?: string,

        @Query('vpcId') vpcId?: string
    ) {
        return this.service.syncLoadBalancersFromAws(cloudAccountId, org.id, region, vpcId);
    }
}
