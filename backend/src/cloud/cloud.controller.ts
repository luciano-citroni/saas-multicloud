import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';
import { CloudService } from './cloud.service';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { Organization } from '../db/entites/organization.entity';
import { CloudProvider } from '../db/entites/cloud-account.entity';
import { createCloudAccountSchema, listCloudAccountsQuerySchema } from './dto';
import { CloudAccountResponseDto, CreateCloudAccountRequestDto, ValidationErrorResponseDto } from './swagger.dto';
import type { CreateCloudAccountDto, ListCloudAccountsQueryDto } from './dto';
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
     * Acessível apenas por OWNER ou ADMIN organização criar uma nova conta de cloud.
     */
    @Post('accounts')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN) // Permite que membros criem contas, mas o ideal seria OWNER/ADMIN apenas. Ajuste conforme necessário.
    @ApiBody({ type: CreateCloudAccountRequestDto })
    @ApiOperation({ summary: 'Criar uma nova conta de cloud' })
    @ApiResponse({ status: 201, description: 'Conta de cloud criada com sucesso', type: CloudAccountResponseDto })
    @ApiResponse({ status: 400, description: 'Dados inválidos', type: ValidationErrorResponseDto })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas OWNER ou ADMIN' })
    async createCloudAccount(@CurrentOrganization() org: Organization, @Body(new ZodValidationPipe(createCloudAccountSchema)) dto: CreateCloudAccountDto) {
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
    async listAccounts(
        @CurrentOrganization() org: Organization,
        @Query(new ZodValidationPipe(listCloudAccountsQuerySchema)) query: ListCloudAccountsQueryDto
    ) {
        return this.cloudService.findByOrganization(org.id, query);
    }
}
