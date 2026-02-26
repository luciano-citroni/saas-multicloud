import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMember } from '../db/entites/organization-member.entity';

export const SKIP_TENANT_KEY = 'skipTenant';

export const SkipTenant = () => SetMetadata(SKIP_TENANT_KEY, true);

/**
 * Extrai a organização ativa do request.
 * Injetada pelo TenantGuard a partir do header `x-organization-id`.
 *
 * @example
 * @Get('settings')
 * getSettings(@CurrentOrganization() org: Organization) {
 *   return this.service.getSettings(org.id);
 * }
 */
export const CurrentOrganization = createParamDecorator((_data: unknown, ctx: ExecutionContext): Organization => {
    const request = ctx.switchToHttp().getRequest();
    return request.organization;
});

/**
 * Extrai o membership (incluindo role) do usuário na organização ativa.
 * Injetado pelo TenantGuard.
 *
 * @example
 * @Get('my-role')
 * getMyRole(@CurrentMembership() membership: OrganizationMember) {
 *   return { role: membership.role };
 * }
 */
export const CurrentMembership = createParamDecorator((_data: unknown, ctx: ExecutionContext): OrganizationMember => {
    const request = ctx.switchToHttp().getRequest();
    return request.membership;
});
