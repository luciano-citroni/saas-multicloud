export type SidebarContextOrganization = {
    id: string;
    name: string;
    slug?: string;
    currentRole?: string | null;
    maxCloudAccounts?: number;
    maxUsers?: number;
    plans?: string[];
};

export type SidebarContextUser = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
};

export type SidebarContextPayload = {
    user: SidebarContextUser;
    organizations: SidebarContextOrganization[];
};
