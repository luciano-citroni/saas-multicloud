/**
 * Backward-compatibility alias for TenantMember.
 * OrganizationMember now maps to the tenant_members table via TenantMember.
 * Existing code that imports OrganizationMember continues to work.
 */
export { TenantMember as OrganizationMember } from './tenant-member.entity';
