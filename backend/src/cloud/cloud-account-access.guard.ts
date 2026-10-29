import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ErrorMessages } from '../common/messages/error-messages';
import { CloudService } from './cloud.service';

/**
 * Ensures `:cloudAccountId` (when present) belongs to the active tenant.
 * Must run AFTER TenantGuard so `request.organization` is set.
 */
@Injectable()
export class CloudAccountAccessGuard implements CanActivate {
    constructor(private readonly cloudService: CloudService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            params?: { cloudAccountId?: string };
            organization?: { id?: string };
        }>();

        const cloudAccountId = request.params?.cloudAccountId;
        if (!cloudAccountId) {
            return true;
        }

        const tenantId = request.organization?.id;
        if (!tenantId) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }

        await this.cloudService.assertBelongsToTenant(cloudAccountId, tenantId);
        return true;
    }
}
