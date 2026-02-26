import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentMembership, CurrentOrganization } from '../tenant/tenant.decorators';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMember } from '../db/entites/organization-member.entity';

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
    /**
     * Acessível por qualquer membro da organização (VIEWER, MEMBER, ADMIN, OWNER).
     */
    @ApiOperation({ summary: 'Lista contas de cloud da organização ativa' })
    @Get('accounts')
    listAccounts(@CurrentOrganization() org: Organization, @CurrentUser() user: { sub: string }) {
        return {
            message: 'Cloud accounts for organization',
            organizationId: org.id,
            organizationName: org.name,
            requestedBy: user.sub,
        };
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
