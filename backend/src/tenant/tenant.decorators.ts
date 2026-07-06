import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Tenant } from '../db/entites/tenant.entity';
import { TenantMember } from '../db/entites/tenant-member.entity';

export const SKIP_TENANT_KEY = 'skipTenant';
export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);

/**
 * Extracts the active tenant from the request.
 * Injected by TenantGuard from the `x-organization-id` header.
 * Returns a Tenant entity (previously Organization).
 */
export const CurrentOrganization = createParamDecorator((_data: unknown, ctx: ExecutionContext): Tenant => {
    const request = ctx.switchToHttp().getRequest();
    return request.organization;
});

/**
 * Extracts the membership (including role) of the authenticated user in the active tenant.
 * Injected by TenantGuard.
 */
export const CurrentMembership = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantMember => {
    const request = ctx.switchToHttp().getRequest();
    return request.membership;
});
