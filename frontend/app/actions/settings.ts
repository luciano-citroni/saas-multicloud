export type CurrentUser = {
    id: string;
    name: string;
    email: string;
    cpf: string | null;
    isActive: boolean;
    hasPassword: boolean;
};

export type ActiveSession = {
    id: string;
    createdAt: string;
    expiresAt: string;
    isCurrent: boolean;
};

export type RemoveSessionResult = {
    success: boolean;
    removedSessionId: string;
    removedCurrent: boolean;
};

export async function fetchCurrentUser() {
    return fetch('/api/auth/me', {
        cache: 'no-store',
    });
}

export async function updateCurrentUser(payload: { name?: string; email?: string; cpf?: string }) {
    return fetch('/api/auth/me', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
}

export async function updateCurrentPassword(payload: { currentPassword?: string; newPassword: string }) {
    return fetch('/api/auth/me/password', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
}

export async function fetchActiveSessions() {
    return fetch('/api/auth/sessions', {
        cache: 'no-store',
    });
}

export async function removeSession(sessionId: string) {
    return fetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
    });
}
