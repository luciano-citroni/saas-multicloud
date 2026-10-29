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

export type NotificationWhatsappTargetPayload = {
    targetType: 'phone' | 'group';
    target: string;
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

export async function createNotificationWhatsappTarget(
    organizationId: string,
    groupId: string,
    payload: NotificationWhatsappTargetPayload
) {
    return fetch(
        `/api/notifications/groups/${encodeURIComponent(groupId)}/whatsapp-targets?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export type JoinWhatsappGroupInvitePayload = {
    inviteLink: string;
    label?: string | null;
    isActive?: boolean;
};

export async function joinWhatsappGroupByInvite(
    organizationId: string,
    groupId: string,
    payload: JoinWhatsappGroupInvitePayload
) {
    return fetch(
        `/api/notifications/groups/${encodeURIComponent(groupId)}/whatsapp-targets/join-invite?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function updateNotificationWhatsappTarget(
    organizationId: string,
    id: string,
    payload: Partial<NotificationWhatsappTargetPayload>
) {
    return fetch(
        `/api/notifications/whatsapp-targets/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
}

export async function deleteNotificationWhatsappTarget(organizationId: string, id: string) {
    return fetch(
        `/api/notifications/whatsapp-targets/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
    );
}

export async function sendNotificationWhatsappTargetTest(organizationId: string, id: string) {
    return fetch(
        `/api/notifications/whatsapp-targets/${encodeURIComponent(id)}/test?organizationId=${encodeURIComponent(organizationId)}`,
        { method: 'POST' }
    );
}
