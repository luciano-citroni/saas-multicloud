/**
 * Backward-compatibility re-export.
 * Invites are now stored in tenant_invites via TenantInvite.
 */
export { TenantInvite as OrganizationInvite } from './tenant-invite.entity';
export { TenantInviteStatus as InviteStatus } from './tenant-invite.entity';
