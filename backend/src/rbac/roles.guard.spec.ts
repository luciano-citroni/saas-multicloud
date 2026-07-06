import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { OrgRole } from './roles.enum';
import { ROLES_KEY } from './roles.decorator';

function createExecutionContext(membership?: { role: OrgRole }): ExecutionContext {
    const request: Record<string, unknown> = {};

    if (membership) {
        request.membership = membership;
    }

    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
        getHandler: () => ({}),
        getClass: () => class {},
    } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
    let reflector: jest.Mocked<Reflector>;
    let guard: RolesGuard;

    beforeEach(() => {
        reflector = {
            getAllAndOverride: jest.fn(),
        } as unknown as jest.Mocked<Reflector>;

        guard = new RolesGuard(reflector);
    });

    it('permite acesso quando endpoint não define @Roles', () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ROLES_KEY) return undefined;
            return undefined;
        });

        const context = createExecutionContext();
        expect(guard.canActivate(context)).toBe(true);
    });

    it('bloqueia quando @Roles existe mas membership não foi injetado', () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ROLES_KEY) return [OrgRole.ADMIN];
            return undefined;
        });

        const context = createExecutionContext();
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('permite OWNER quando endpoint exige ADMIN', () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ROLES_KEY) return [OrgRole.ADMIN];
            return undefined;
        });

        const context = createExecutionContext({ role: OrgRole.OWNER });
        expect(guard.canActivate(context)).toBe(true);
    });

    it('bloqueia MEMBER quando endpoint exige ADMIN', () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ROLES_KEY) return [OrgRole.ADMIN];
            return undefined;
        });

        const context = createExecutionContext({ role: OrgRole.MEMBER });
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('usa menor role exigida quando há múltiplas roles', () => {
        reflector.getAllAndOverride.mockImplementation((key: string) => {
            if (key === ROLES_KEY) return [OrgRole.ADMIN, OrgRole.MEMBER];
            return undefined;
        });

        const context = createExecutionContext({ role: OrgRole.MEMBER });
        expect(guard.canActivate(context)).toBe(true);
    });
});
