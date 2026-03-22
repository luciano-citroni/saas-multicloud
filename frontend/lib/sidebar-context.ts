export const ACTIVE_ORG_STORAGE_KEY = 'smc_active_organization_id';
export const SIDEBAR_CONTEXT_UPDATED_EVENT = 'smc:sidebar-context-updated';
export const ACTIVE_ORG_CHANGED_EVENT = 'smc:active-organization-changed';
export const ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT = 'smc:active-cloud-account-changed';

export function notifySidebarContextUpdated() {
    window.dispatchEvent(new Event(SIDEBAR_CONTEXT_UPDATED_EVENT));
}

export function notifyActiveOrganizationChanged() {
    window.dispatchEvent(new Event(ACTIVE_ORG_CHANGED_EVENT));
}

export function notifyActiveCloudAccountChanged() {
    window.dispatchEvent(new Event(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT));
}
