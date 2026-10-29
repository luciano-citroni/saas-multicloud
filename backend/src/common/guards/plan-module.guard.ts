import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../../billing/billing.service';

export const PLAN_MODULE_KEY = 'plan_module';

export const RequirePlanModule = (moduleName: string) => SetMetadata(PLAN_MODULE_KEY, moduleName);

/**
 * Enforces plan module access after TenantGuard has set `request.organization`.
 */
@Injectable()
export class PlanModuleGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly billingService: BillingService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const moduleName = this.reflector.getAllAndOverride<string | undefined>(PLAN_MODULE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!moduleName) {
            return true;
        }

        const request = context.switchToHttp().getRequest<{ organization?: { id?: string } }>();
        const tenantId = request.organization?.id;
        if (!tenantId) {
            return false;
        }

        await this.billingService.assertModuleEnabled(tenantId, moduleName);
        return true;
    }
}
