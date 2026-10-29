export const queryKeys = {
    sidebarContext: ['sidebar-context'] as const,
    cloudAccounts: (organizationId: string) => ['cloud-accounts', organizationId] as const,
};
