import { type UserOrganization } from '@/app/actions/organization';

export type RoleFilter = 'all' | 'owner' | 'admin' | 'member' | 'viewer';

export type OrganizationsApiPayload =
    | UserOrganization[]
    | {
          items?: UserOrganization[];
      };

export function normalizeOrganizations(payload: OrganizationsApiPayload | null): UserOrganization[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

    return items.filter((organization): organization is UserOrganization => {
        return typeof organization?.id === 'string' && typeof organization?.name === 'string';
    });
}

export function formatOrganizationRole(
    role: string | null | undefined,
    ownerLabel: string,
    adminLabel: string,
    memberLabel: string,
    viewerLabel: string,
    noRoleLabel: string
) {
    const normalized = (role ?? '').trim().toUpperCase();

    if (normalized === 'OWNER') return ownerLabel;
    if (normalized === 'ADMIN') return adminLabel;
    if (normalized === 'MEMBER') return memberLabel;
    if (normalized === 'VIEWER') return viewerLabel;

    return noRoleLabel;
}
