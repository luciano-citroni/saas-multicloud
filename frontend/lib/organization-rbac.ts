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

export function canManageBilling(role: OrganizationRole | null): boolean {
    return hasRequiredOrganizationRole(role, 'ADMIN');
}
