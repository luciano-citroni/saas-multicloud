export const queryKeys = {
    sidebarContext: ['sidebar-context'] as const,
    cloudAccounts: (organizationId: string, midOrgId?: string | null) =>
        ['cloud-accounts', organizationId, midOrgId ?? null] as const,
};
