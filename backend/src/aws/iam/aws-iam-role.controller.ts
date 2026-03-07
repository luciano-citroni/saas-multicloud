import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AwsIamRoleService } from './aws-iam-role.service';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { IamRoleResponseDto, IamRoleSyncResponseDto } from './swagger.dto';

@ApiTags('AWS IAM Roles')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/iam/roles')
export class AwsIamRoleController {
    constructor(private readonly service: AwsIamRoleService) {}

    // =========================================================================
    // IAM Roles - Banco de Dados
    // =========================================================================

    @Get('accounts/:cloudAccountId')
    @ApiOperation({
        summary: 'Listar roles IAM do banco de dados',
        description:
            'Retorna as roles IAM da conta. ' +
            'Por padrão (roleScope=user) exibe apenas roles com path "/" — criadas explicitamente por usuários via console, CLI ou IaC. ' +
            'Use roleScope=all para incluir também /service-role/ e /aws-service-role/. ' +
            'Use ?pathPrefix= para filtrar por caminho específico.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({
        name: 'roleScope',
        required: false,
        description: 'user (padrão): apenas roles com path "/" criadas por usuários. ' + 'all: todas as roles sem filtro de path.',
        enum: ['user', 'all'],
    })
    @ApiQuery({
        name: 'pathPrefix',
        required: false,
        description: 'Sobrescreve o filtro de roleScope e filtra por prefixo de caminho (ex: /service-role/)',
        type: 'string',
    })
    @ApiResponse({
        status: 200,
        description: 'Lista de roles IAM do banco de dados',
        type: [IamRoleResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listRoles(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Query('roleScope') roleScope?: string,
        @Query('pathPrefix') pathPrefix?: string,
        @CurrentOrganization() org?: Organization
    ) {
        const scope = roleScope === 'all' ? 'all' : 'user';
        return this.service.listRolesFromDatabase(cloudAccountId, pathPrefix, scope);
    }

    @Get('accounts/:cloudAccountId/roles/:roleId')
    @ApiOperation({
        summary: 'Buscar role IAM por ID',
        description: 'Retorna os detalhes de uma role IAM específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'roleId', type: 'string', format: 'uuid', description: 'UUID da role no banco de dados' })
    @ApiResponse({
        status: 200,
        description: 'Detalhes da role IAM',
        type: IamRoleResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Role não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getRole(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('roleId', ParseUUIDPipe) roleId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getRoleById(roleId, cloudAccountId);
    }

    // =========================================================================
    // Sincronização AWS → Banco de Dados
    // =========================================================================

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar roles IAM da AWS',
        description:
            'Busca as roles IAM da conta e armazena/atualiza no banco de dados, incluindo políticas anexadas e inline. ' +
            'Por padrão (roleScope=user) sincroniza apenas roles com path "/" e políticas customer-managed (criadas na conta do usuário). ' +
            'Use roleScope=all para sincronizar todas as roles e também políticas AWS-managed.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({
        name: 'roleScope',
        required: false,
        description: 'user (padrão): apenas roles com path "/" criadas por usuários. ' + 'all: todas as roles sem filtro de path.',
        enum: ['user', 'all'],
    })
    @ApiQuery({
        name: 'pathPrefix',
        required: false,
        description: 'Sobrescreve o filtro de roleScope e sincroniza por prefixo de caminho (ex: /service-role/).',
        type: 'string',
    })
    @ApiResponse({
        status: 200,
        description: 'Roles IAM sincronizadas com sucesso',
        type: [IamRoleSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncRoles(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
        @Query('roleScope') roleScope?: string,
        @Query('pathPrefix') pathPrefix?: string
    ) {
        const scope = roleScope === 'all' ? 'all' : 'user';
        return this.service.syncRolesFromAws(cloudAccountId, org.id, pathPrefix, scope);
    }
}
