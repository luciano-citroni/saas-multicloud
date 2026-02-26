import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationMember } from '../db/entites/organization-member.entity';
import { ROLES_KEY } from './roles.decorator';
import { OrgRole, ROLE_HIERARCHY } from './roles.enum';

/**
 * Guard de RBAC baseado no role do usuário dentro da organização ativa.
 *
 * IMPORTANTE: Deve ser usado APÓS o TenantGuard, pois depende de
 * `request.membership` injetado por ele.
 *
 * Comportamento:
 * - Se o endpoint não tem @Roles(), deixa passar (sem restrição de role).
 * - Usa hierarquia: OWNER >= ADMIN >= MEMBER >= VIEWER.
 *   Ex: @Roles(OrgRole.ADMIN) → OWNER também passa.
 *
 * @example
 * @UseGuards(JwtGuard, TenantGuard, RolesGuard)
 * @Roles(OrgRole.ADMIN)
 * @Patch('settings')
 * updateSettings() {}
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // Sem @Roles() → endpoint não tem restrição de role, passa.
        if (!requiredRoles || requiredRoles.length === 0) return true;

        const request = context.switchToHttp().getRequest();
        const membership: OrganizationMember | undefined = request.membership;

        // TenantGuard não rodou ou não injetou membership — erro de configuração.
        if (!membership) {
            throw new ForbiddenException(
                'No organization membership found. Ensure TenantGuard runs before RolesGuard.',
            );
        }

        const userRole = membership.role as OrgRole;
        const userLevel = ROLE_HIERARCHY[userRole] ?? 0;

        // O usuário precisa ter nível >= ao menor role exigido.
        // Ex: @Roles(ADMIN) → requiredLevel = 3 → OWNER(4) e ADMIN(3) passam.
        const minimumRequired = Math.min(...requiredRoles.map((r) => ROLE_HIERARCHY[r] ?? 0));

        if (userLevel < minimumRequired) {
            throw new ForbiddenException(
                `Insufficient permissions. Required: ${requiredRoles.join(' or ')}. Your role: ${userRole}.`,
            );
        }

        return true;
    }
}
