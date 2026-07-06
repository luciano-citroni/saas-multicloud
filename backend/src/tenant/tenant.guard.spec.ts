import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_MISSING_ORG_KEY, IS_PUBLIC_KEY } from '../auth/decorators';
import { ROLES_KEY } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { SKIP_TENANT_KEY } from './tenant.decorators';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';

type MockRequest = {
    method?: string;
    user?: { sub?: string };
    headers: Record<string, string | string[] | undefined>;
    organization?: unknown;
    membership?: unknown;
};

function createHttpExecutionContext(request: MockRequest): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
        getHandler: () => ({}),
        getClass: () => class {},
    } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
    const validOrgId = '11111111-1111-1111-1111-111111111111';

    let reflector: jest.Mocked<Reflector>;
    let tenantService: jest.Mocked<TenantService>;
    let guard: TenantGuard;

    beforeEach(() => {
        reflector = {
            getAllAndOverride: jest.fn((key: string) => (key === ROLES_KEY ? undefined : false)),
        } as unknown as jest.Mocked<Reflector>;

        tenantService = {
            resolveMembership: jest.fn(),
        } as unknown as jest.Mocked<TenantService>;

        guard = new TenantGuard(tenantService, reflector);
    });

    it('permite acesso em endpoint público', async () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === IS_PUBLIC_KEY) return true;
            if (key === ROLES_KEY) return undefined;
            return false;
        });
        const context = createHttpExecutionContext({ headers: {} });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(tenantService.resolveMembership).not.toHaveBeenCalled();
    });

    it('bloqueia quando usuário não está autenticado', async () => {
        const context = createHttpExecutionContext({ method: 'GET', headers: { 'x-organization-id': validOrgId } });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('permite ausência de organização quando AllowMissingOrganization está ativo', async () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ALLOW_MISSING_ORG_KEY) return true;
            if (key === ROLES_KEY) return undefined;
            return false;
        });
        const context = createHttpExecutionContext({
            method: 'GET',
            user: { sub: 'user-1' },
            headers: {},
        });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(tenantService.resolveMembership).not.toHaveBeenCalled();
    });

    it('bloqueia quando x-organization-id está ausente', async () => {
        const context = createHttpExecutionContext({ method: 'GET', user: { sub: 'user-1' }, headers: {} });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('bloqueia quando x-organization-id é inválido', async () => {
        const context = createHttpExecutionContext({
            method: 'GET',
            user: { sub: 'user-1' },
            headers: { 'x-organization-id': 'invalid-id' },
        });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('bloqueia quando usuário não possui membership no tenant', async () => {
        tenantService.resolveMembership.mockResolvedValue(null);
        const context = createHttpExecutionContext({
            method: 'GET',
            user: { sub: 'user-1' },
            headers: { 'x-organization-id': validOrgId },
        });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permite leitura com role VIEWER e injeta tenant/membership', async () => {
        const membership = {
            role: OrgRole.VIEWER,
            tenant: { id: validOrgId },
        };

        tenantService.resolveMembership.mockResolvedValue(membership as never);

        const request: MockRequest = {
            method: 'GET',
            user: { sub: 'user-1' },
            headers: { 'x-organization-id': validOrgId },
        };

        const context = createHttpExecutionContext(request);

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request.organization).toEqual(membership.tenant);
        expect(request.membership).toEqual(membership);
    });

    it('bloqueia escrita com role VIEWER', async () => {
        tenantService.resolveMembership.mockResolvedValue({
            role: OrgRole.VIEWER,
            tenant: { id: validOrgId },
        } as never);

        const context = createHttpExecutionContext({
            method: 'POST',
            user: { sub: 'user-1' },
            headers: { 'x-organization-id': validOrgId },
        });

        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permite escrita com role VIEWER quando endpoint declara @Roles(VIEWER)', async () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ROLES_KEY) {
                return [OrgRole.VIEWER];
            }

            return false;
        });

        tenantService.resolveMembership.mockResolvedValue({
            role: OrgRole.VIEWER,
            tenant: { id: validOrgId },
        } as never);

        const context = createHttpExecutionContext({
            method: 'POST',
            user: { sub: 'user-1' },
            headers: { 'x-organization-id': validOrgId },
        });

        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('permite escrita com role MEMBER', async () => {
        tenantService.resolveMembership.mockResolvedValue({
            role: OrgRole.MEMBER,
            tenant: { id: validOrgId },
        } as never);

        const context = createHttpExecutionContext({
            method: 'PATCH',
            user: { sub: 'user-1' },
            headers: { 'x-organization-id': validOrgId },
        });

        await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('permite acesso quando SkipTenant está ativo', async () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === SKIP_TENANT_KEY) return true;
            if (key === ROLES_KEY) return undefined;
            return false;
        });
        const context = createHttpExecutionContext({ method: 'DELETE', headers: {}, user: { sub: 'user-1' } });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(tenantService.resolveMembership).not.toHaveBeenCalled();
    });
});
