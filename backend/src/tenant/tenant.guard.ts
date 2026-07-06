import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ALLOW_MISSING_ORG_KEY } from '../auth/decorators';
import { SKIP_TENANT_KEY } from './tenant.decorators';
import { TenantService } from './tenant.service';
import { OrgRole, ROLE_HIERARCHY } from '../rbac/roles.enum';
import { ROLES_KEY } from '../rbac/roles.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
    constructor(
        private readonly tenantService: TenantService,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
        if (isPublic) return true;

        const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [context.getHandler(), context.getClass()]);
        if (skipTenant) return true;

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user?.sub) {
            throw new UnauthorizedException('User not authenticated.');
        }

        const rawTenantId = request.headers['x-organization-id'];
        const tenantId = Array.isArray(rawTenantId) ? rawTenantId[0] : rawTenantId;

        const allowMissingOrg = this.reflector.getAllAndOverride<boolean>(ALLOW_MISSING_ORG_KEY, [context.getHandler(), context.getClass()]);

        if (!tenantId) {
            if (allowMissingOrg) return true;
            throw new ForbiddenException('Missing tenant context. Send the "x-organization-id" header.');
        }

        if (!this.isValidUuid(tenantId)) {
            throw new ForbiddenException('Invalid tenant ID format.');
        }

        const membership = await this.tenantService.resolveMembership(user.sub, tenantId);

        if (!membership) {
            throw new ForbiddenException('You do not have access to this tenant or it does not exist.');
        }

        // Baseline de RBAC: endpoints mutáveis exigem no mínimo MEMBER.
        // Regras mais estritas (ADMIN/OWNER) continuam sendo aplicadas via RolesGuard + @Roles.
        if (this.isMutatingMethod(request.method)) {
            const membershipRole = membership.role as OrgRole;
            const roleLevel = ROLE_HIERARCHY[membershipRole] ?? 0;
            const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
            const allowsViewerWrite = Boolean(requiredRoles?.includes(OrgRole.VIEWER));

            if (roleLevel < ROLE_HIERARCHY[OrgRole.MEMBER] && !allowsViewerWrite) {
                throw new ForbiddenException('Insufficient permissions for write operations.');
            }
        }

        // Inject tenant and membership into request for use by controllers
        request.organization = membership.tenant;
        request.membership = membership;

        return true;
    }

    private isValidUuid(value: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(value);
    }

    private isMutatingMethod(method: string | undefined): boolean {
        if (!method) return false;

        return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    }
}
