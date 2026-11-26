export const ORGANIZATION_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

const ROLE_HIERARCHY: Record<OrganizationRole, number> = {
    OWNER: 4,
    ADMIN: 3,
    MEMBER: 2,
    VIEWER: 1,
};

export function normalizeOrganizationRole(value: string | null | undefined): OrganizationRole | null {
    if (!value) {
        return null;
    }

    const upper = value.toUpperCase();

    if (upper === 'OWNER' || upper === 'ADMIN' || upper === 'MEMBER' || upper === 'VIEWER') {
        return upper;
    }

    return null;
}

export function hasRequiredOrganizationRole(role: OrganizationRole | null, minimumRole: OrganizationRole): boolean {
    if (!role) {
        return false;
    }

    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole];
}

export function canManageCloudAccounts(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}

export function canSyncCloudAccounts(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'MEMBER');
}

/** Day-to-day module use (scans, FinOps sync/consent, notifications, budgets). VIEWER is read-only. */
export function canOperateModules(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'MEMBER');
}

export function canManageBilling(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}

/** Tenant OWNER/ADMIN can see and manage every mid-org in the tenant. */
export function canSeeAllOrganizations(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}

export function canEditOrganization(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}

export function canDeleteOrganization(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}

export function canManageMembers(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}

/** Roles an inviter can assign on invite, based on their own role. */
export function getAssignableInviteRoles(
    requesterRole: OrganizationRole | null,
): Array<'ADMIN' | 'MEMBER' | 'VIEWER'> {
    if (requesterRole === 'OWNER') return ['ADMIN', 'MEMBER', 'VIEWER'];
    if (requesterRole === 'ADMIN') return ['MEMBER', 'VIEWER'];
    return [];
}

/** True when the user can invite into at least one mid-org as ADMIN+. */
export function canInviteAsOrganizationAdmin(
    organizationRoles: Array<OrganizationRole | null | undefined>,
): boolean {
    return organizationRoles.some((role) => hasRequiredOrganizationRole(role ?? null, 'ADMIN'));
}
