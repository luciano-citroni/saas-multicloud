export const ACTIVE_ORG_STORAGE_KEY = 'smc_active_organization_id';
export const SIDEBAR_CONTEXT_UPDATED_EVENT = 'smc:sidebar-context-updated';

export function notifySidebarContextUpdated() {
    window.dispatchEvent(new Event(SIDEBAR_CONTEXT_UPDATED_EVENT));
}
