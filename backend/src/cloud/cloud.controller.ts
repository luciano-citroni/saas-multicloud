import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CloudService } from './cloud.service';
import { CurrentUser } from '../auth/decorators';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentMembership, CurrentOrganization } from '../tenant/tenant.decorators';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMember } from '../db/entites/organization-member.entity';
import { createCloudAccountSchema } from './dto';
import type { CreateCloudAccountDto } from './dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

/**
 * Controller de exemplo demonstrando a stack completa de segurança:
 *   JwtGuard → TenantGuard → RolesGuard
 *
 * Todos os endpoints aqui exigem:
 *   1. Token JWT válido (JwtGuard — aplicado globalmente no AppModule)
 *   2. Header `x-organization-id` com uma org à qual o usuário pertence (TenantGuard)
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
     * Acessível apenas por ADMIN e OWNER — criar uma nova conta de cloud.
     */
    @Post('accounts')
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Criar uma nova conta de cloud' })
    @ApiResponse({
        status: 201,
        description: 'Conta de cloud criada com sucesso',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174001',
                organizationId: '123e4567-e89b-12d3-a456-426614174000',
                provider: 'aws',
                alias: 'Produção',
                isActive: true,
                createdAt: '2026-02-27T10:00:00Z',
                updatedAt: '2026-02-27T10:00:00Z',
            },
        },
    })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Acesso negado — apenas ADMIN+' })
    async createCloudAccount(@CurrentOrganization() org: Organization, @Body(new ZodValidationPipe(createCloudAccountSchema)) dto: CreateCloudAccountDto) {
        return this.cloudService.createCloudAccount(org.id, dto);
    }

    /**
     * Acessível por qualquer membro da organização (VIEWER, MEMBER, ADMIN, OWNER).
     */
    @Get('accounts')
    @ApiOperation({ summary: 'Lista contas de cloud da organização ativa' })
    @ApiResponse({
        status: 200,
        description: 'Lista de contas de cloud',
    })
    async listAccounts(@CurrentOrganization() org: Organization) {
        return this.cloudService.findByOrganization(org.id);
    }

    /**
     * Acessível apenas por ADMIN e OWNER (hierarquia: OWNER >= ADMIN).
     */
    @ApiOperation({ summary: 'Configurações avançadas — apenas ADMIN e OWNER' })
    @Roles(OrgRole.ADMIN)
    @Get('settings')
    getSettings(@CurrentOrganization() org: Organization, @CurrentMembership() membership: OrganizationMember) {
        return {
            message: 'Admin-only cloud settings',
            organizationId: org.id,
            yourRole: membership.role,
        };
    }

    /**
     * Acessível apenas pelo OWNER da organização.
     */
    @ApiOperation({ summary: 'Gerenciamento de credenciais — apenas OWNER' })
    @Roles(OrgRole.OWNER)
    @Get('credentials')
    manageCredentials(@CurrentOrganization() org: Organization, @CurrentMembership() membership: OrganizationMember) {
        return {
            message: 'Owner-only credentials management',
            organizationId: org.id,
            yourRole: membership.role,
        };
    }

    /**
     * Endpoint de diagnóstico: retorna o contexto completo do request.
     * Útil para verificar que guards e decorators funcionam corretamente.
     */
    @ApiOperation({ summary: 'Diagnóstico do contexto de tenant e role' })
    @Get('context')
    getContext(@CurrentUser() user: { sub: string }, @CurrentOrganization() org: Organization, @CurrentMembership() membership: OrganizationMember) {
        return {
            user: {
                id: user.sub,
            },
            organization: {
                id: org.id,
                name: org.name,
            },
            membership: {
                id: membership.id,
                role: membership.role,
                joinedAt: membership.joinedAt,
            },
        };
    }
}
