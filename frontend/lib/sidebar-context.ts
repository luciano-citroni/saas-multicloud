export const ACTIVE_ORG_STORAGE_KEY = 'smc_active_organization_id';
export const ACTIVE_MID_ORG_STORAGE_KEY_PREFIX = 'smc_active_mid_org_id:';

export function getActiveMidOrgStorageKey(tenantId: string) {
    return `${ACTIVE_MID_ORG_STORAGE_KEY_PREFIX}${tenantId}`;
}

/** Returns the active mid-org (Organização) id for a tenant, or null if unset / SSR. */
export function getActiveMidOrgId(tenantId: string | null | undefined): string | null {
    if (!tenantId || typeof window === 'undefined') {
        return null;
    }

    return window.localStorage.getItem(getActiveMidOrgStorageKey(tenantId));
}

/** Caches the resolved modules of the active org so ModuleAccessGuard avoids a duplicate fetch. */
export const ACTIVE_ORG_MODULES_STORAGE_KEY = 'smc_active_org_modules';
export const SIDEBAR_CONTEXT_UPDATED_EVENT = 'smc:sidebar-context-updated';
export const ACTIVE_ORG_CHANGED_EVENT = 'smc:active-organization-changed';
export const ACTIVE_MID_ORG_CHANGED_EVENT = 'smc:active-mid-org-changed';
export const ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT = 'smc:active-cloud-account-changed';
export const AI_CHAT_OPEN_EVENT = 'smc:ai-chat-open';

export function notifySidebarContextUpdated() {
    window.dispatchEvent(new Event(SIDEBAR_CONTEXT_UPDATED_EVENT));
}

export function notifyActiveOrganizationChanged() {
    window.dispatchEvent(new Event(ACTIVE_ORG_CHANGED_EVENT));
}

export function notifyActiveMidOrgChanged() {
    window.dispatchEvent(new Event(ACTIVE_MID_ORG_CHANGED_EVENT));
}

export function notifyActiveCloudAccountChanged() {
    window.dispatchEvent(new Event(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT));
}

export function notifyAiChatOpen() {
    window.dispatchEvent(new Event(AI_CHAT_OPEN_EVENT));
}
