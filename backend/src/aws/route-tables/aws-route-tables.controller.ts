import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AwsRouteTablesService } from './aws-route-tables.service';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { RouteTableResponseDto, RouteTableSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Route Tables')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/route-tables')
export class AwsRouteTablesController {
    constructor(private readonly service: AwsRouteTablesService) {}

    // =========================================================================
    // Route Tables - Banco de Dados
    // =========================================================================

    @Get('accounts/:cloudAccountId')
    @ApiOperation({
        summary: 'Listar Route Tables do banco de dados',
        description: 'Retorna as Route Tables sincronizadas e armazenadas no banco de dados. Use ?vpcId= para filtrar por VPC.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,
        description: 'Lista de Route Tables do banco de dados',
        type: [RouteTableResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listRouteTables(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('vpcId') vpcId: string | undefined,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.listRouteTablesFromDatabase(cloudAccountId, vpcId);
    }

    @Get('accounts/:cloudAccountId/:routeTableId')
    @ApiOperation({
        summary: 'Buscar Route Table por ID',
        description: 'Retorna uma Route Table específica com todas as suas rotas e associações.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'routeTableId', type: 'string', format: 'uuid', description: 'UUID da Route Table no banco de dados' })
    @ApiResponse({
        status: 200,
        description: 'Route Table encontrada',
        type: RouteTableResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Route Table não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getRouteTableById(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('routeTableId', ParseUUIDPipe) routeTableId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getRouteTableById(routeTableId, cloudAccountId);
    }

    @HttpCode(200)
    @Post('accounts/:cloudAccountId/sync')
    @ApiOperation({
        summary: 'Sincronizar Route Tables da AWS',
        description:
            'Busca as Route Tables da AWS e armazena/atualiza no banco de dados. Também atualiza o tipo das subnets baseado nas rotas. Retorna as Route Tables sincronizadas.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,
        description: 'Route Tables sincronizadas com sucesso',
        type: [RouteTableSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncRouteTables(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('vpcId') vpcId: string | undefined,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.syncRouteTablesFromAws(cloudAccountId, org.id, vpcId);
    }
}
