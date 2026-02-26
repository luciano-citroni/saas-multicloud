import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { SKIP_TENANT_KEY } from './tenant.decorators';

/**
 * Interceptor de seguranca para garantir que rotas autenticadas
 * tenham contexto de tenant (organization + membership) resolvido.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

        const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [context.getHandler(), context.getClass()]);

        if (isPublic || skipTenant) return next.handle();

        const request = context.switchToHttp().getRequest();
        if (request.user && (!request.organization || !request.membership)) {
            throw new ForbiddenException('Missing organization context. Ensure TenantGuard runs for authenticated routes.');
        }

        return next.handle();
    }
}
