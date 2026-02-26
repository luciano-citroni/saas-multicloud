import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { TenantService } from './tenant.service';

/**
 * Guard de contexto de tenant (organização ativa).
 *
 * Responsabilidades:
 * 1. Lê o header `x-organization-id`
 * 2. Verifica se o usuário autenticado pertence à organização via TenantService
 * 3. Injeta `request.organization` e `request.membership` para uso downstream
 *
 * DEVE rodar APÓS o JwtGuard (que popula `request.user`).
 * Ordem recomendada: @UseGuards(TenantGuard, RolesGuard)
 * (JwtGuard já é global no AppModule)
 *
 * Por que o TenantGuard depende do TenantService e não dos repositórios diretamente?
 * O NestJS resolve dependências de providers no contexto do módulo importador.
 * Se o guard dependesse diretamente dos repositórios, os módulos consumidores
 * precisariam registrar os repositórios — quebrando o encapsulamento.
 * Ao usar o TenantService (exportado pelo TenantModule), a cadeia de DI fica
 * contida dentro do TenantModule.
 */
@Injectable()
export class TenantGuard implements CanActivate {
    constructor(
        private readonly tenantService: TenantService,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();

        const user = request.user;
        if (!user?.sub) {
            throw new UnauthorizedException('User not authenticated.');
        }

        const rawOrganizationId = request.headers['x-organization-id'];
        const organizationId = Array.isArray(rawOrganizationId) ? rawOrganizationId[0] : rawOrganizationId;

        if (!organizationId) {
            throw new ForbiddenException('Missing organization context. Send the "x-organization-id" header.');
        }

        if (!this.isValidUuid(organizationId)) {
            throw new ForbiddenException('Invalid organization ID format.');
        }

        const membership = await this.tenantService.resolveMembership(user.sub, organizationId);

        if (!membership) {
            throw new ForbiddenException('You do not have access to this organization or it does not exist.');
        }

        request.organization = membership.organization;
        request.membership = membership;

        return true;
    }

    private isValidUuid(value: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(value);
    }
}
