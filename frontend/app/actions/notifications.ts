export type NotificationChannel = 'email' | 'whatsapp';

export type NotificationGroupPayload = {
    name: string;
    description?: string | null;
    channel?: NotificationChannel;
    isActive?: boolean;
};

export type NotificationEmailPayload = {
    email: string;
    label?: string | null;
    isActive?: boolean;
};

export async function fetchNotificationGroups(
    organizationId: string,
    channel: NotificationChannel = 'email',
    options?: { page?: number; limit?: number }
) {
    const params = new URLSearchParams({
        organizationId,
        channel,
        page: String(options?.page ?? 1),
        limit: String(options?.limit ?? 10),
    });
    return fetch(`/api/notifications/groups?${params.toString()}`, { cache: 'no-store' });
}

export async function createNotificationGroup(organizationId: string, payload: NotificationGroupPayload) {
    return fetch(`/api/notifications/groups?organizationId=${encodeURIComponent(organizationId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateNotificationGroup(
    organizationId: string,
    id: string,
    payload: Partial<NotificationGroupPayload>
) {
    return fetch(
        `/api/notifications/groups/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function deleteNotificationGroup(organizationId: string, id: string) {
    return fetch(
        `/api/notifications/groups/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
    );
}

export async function createNotificationEmail(
    organizationId: string,
    groupId: string,
    payload: NotificationEmailPayload
) {
    return fetch(
        `/api/notifications/groups/${encodeURIComponent(groupId)}/emails?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function updateNotificationEmail(
    organizationId: string,
    id: string,
    payload: Partial<NotificationEmailPayload>
) {
    return fetch(
        `/api/notifications/emails/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function deleteNotificationEmail(organizationId: string, id: string) {
    return fetch(
        `/api/notifications/emails/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
    );
}

export async function sendNotificationTestEmail(organizationId: string, id: string) {
    return fetch(
        `/api/notifications/emails/${encodeURIComponent(id)}/test?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'POST' }
    );
}

export async function sendNotificationGroupTestEmail(organizationId: string, groupId: string) {
    return fetch(
        `/api/notifications/groups/${encodeURIComponent(groupId)}/test?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'POST' }
    );
}
