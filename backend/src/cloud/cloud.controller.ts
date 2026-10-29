import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';
import { CloudService } from './cloud.service';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { Tenant } from '../db/entites/tenant.entity';
import { CloudProvider } from '../db/entites/cloud-account.entity';
import { cloudAccountIdParamSchema, createCloudAccountSchema, listCloudAccountsQuerySchema, updateCloudAccountSchema } from './dto';
import { CloudAccountResponseDto, CreateCloudAccountRequestDto, DeleteCloudAccountResponseDto, ValidationErrorResponseDto } from './swagger.dto';
import type { CloudAccountIdParam, CreateCloudAccountDto, ListCloudAccountsQueryDto, UpdateCloudAccountDto } from './dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

/**
 * Controller de exemplo demonstrando a stack completa de segurança:
 *   JwtGuard – TenantGuard – RolesGuard
 *
 * Todos os endpoints aqui exigem:
 *   1. Token JWT válido (JwtGuard – aplicado globalmente no AppModule)
 *   2. Header `x-organization-id` com uma organização qual o usuário pertence (TenantGuard)
 *   3. Role suficiente dentro dessa organização (RolesGuard + @Roles)
 */
@ApiTags('Cloud Accounts')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('cloud')
export class CloudController {
    constructor(private readonly cloudService: CloudService) {}

    /**
     * Acessível por MEMBER, ADMIN ou OWNER para criar uma nova conta de cloud.
     */
    @Post('accounts')
    @Roles(OrgRole.ADMIN)
    @ApiBody({ type: CreateCloudAccountRequestDto })
    @ApiOperation({ summary: 'Criar uma nova conta de cloud' })
    @ApiResponse({ status: 201, description: 'Conta de cloud criada com sucesso', type: CloudAccountResponseDto })
    @ApiResponse({ status: 400, description: 'Dados inválidos ou falha ao validar a conexão com o provedor', type: ValidationErrorResponseDto })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    async createCloudAccount(@CurrentOrganization() org: Tenant, @Body(new ZodValidationPipe(createCloudAccountSchema)) dto: CreateCloudAccountDto) {
        return this.cloudService.createCloudAccount(org.id, dto);
    }

    /**
     * Acessível por qualquer membro da organização (VIEWER, MEMBER, ADMIN, OWNER).
     */
    @Get('accounts')
    @ApiPaginationQuery()
    @ApiQuery({ name: 'name', required: false, description: 'Filtro por alias da conta cloud (busca parcial)' })
    @ApiQuery({ name: 'isActive', required: false, enum: ['true', 'false'], description: 'Filtra por status ativo/inativo' })
    @ApiOperation({ summary: 'Lista contas de cloud da organização ativa' })
    @ApiResponse({ status: 200, description: 'Lista de contas de cloud', type: CloudAccountResponseDto, isArray: true })
    async listAccounts(@CurrentOrganization() org: Tenant, @Query(new ZodValidationPipe(listCloudAccountsQuerySchema)) query: ListCloudAccountsQueryDto) {
        return this.cloudService.findByOrganization(org.id, query);
    }

    @Get('accounts/:id')
    @Roles(OrgRole.ADMIN)
    @ApiOperation({
        summary: 'Obtém uma conta de cloud por ID para edição (credenciais secretas mascaradas)',
    })
    @ApiResponse({ status: 200, description: 'Conta de cloud encontrada (sem secrets em plaintext)' })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    @ApiResponse({ status: 404, description: 'Conta de cloud não encontrada' })
    async getAccountById(@CurrentOrganization() org: Tenant, @Param(new ZodValidationPipe(cloudAccountIdParamSchema)) params: CloudAccountIdParam) {
        return this.cloudService.getAccountForEdit(org.id, params.id);
    }

    @Patch('accounts/:id')
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Atualiza uma conta de cloud por ID' })
    @ApiResponse({ status: 200, description: 'Conta de cloud atualizada com sucesso', type: CloudAccountResponseDto })
    @ApiResponse({ status: 400, description: 'Dados inválidos ou falha ao validar a conexão com o provedor', type: ValidationErrorResponseDto })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    @ApiResponse({ status: 404, description: 'Conta de cloud não encontrada' })
    async updateCloudAccount(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(cloudAccountIdParamSchema)) params: CloudAccountIdParam,
        @Body(new ZodValidationPipe(updateCloudAccountSchema)) dto: UpdateCloudAccountDto
    ) {
        return this.cloudService.updateCloudAccount(org.id, params.id, dto);
    }

    @Delete('accounts/:id')
    @Roles(OrgRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Exclui uma conta de cloud por ID' })
    @ApiResponse({ status: 200, description: 'Conta de cloud excluida com sucesso', type: DeleteCloudAccountResponseDto })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    @ApiResponse({ status: 404, description: 'Conta de cloud não encontrada' })
    async deleteCloudAccount(@CurrentOrganization() org: Tenant, @Param(new ZodValidationPipe(cloudAccountIdParamSchema)) params: CloudAccountIdParam) {
        return this.cloudService.deleteCloudAccount(org.id, params.id);
    }
}
