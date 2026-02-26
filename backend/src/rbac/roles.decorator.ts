import { SetMetadata } from '@nestjs/common';
import { OrgRole } from './roles.enum';

export const ROLES_KEY = 'roles';

/**
 * Define o(s) role(s) mínimo(s) necessários para acessar um endpoint.
 *
 * Usa hierarquia: @Roles(OrgRole.ADMIN) permite ADMIN e OWNER.
 *
 * @example
 * // Apenas ADMIN e OWNER
 * @Roles(OrgRole.ADMIN)
 * @Get('settings')
 * getSettings() {}
 *
 * // Apenas OWNER
 * @Roles(OrgRole.OWNER)
 * @Delete(':id')
 * deleteOrg() {}
 */
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);
