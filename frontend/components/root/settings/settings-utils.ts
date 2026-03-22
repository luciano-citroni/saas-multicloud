import { type CurrentUser, type RemoveSessionResult } from '@/app/actions/settings';

export function normalizeOptionalCpf(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    return value;
}

export function isCurrentUser(payload: unknown): payload is CurrentUser {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const value = payload as Partial<CurrentUser>;

    return typeof value.id === 'string' && typeof value.name === 'string' && typeof value.email === 'string';
}

export function isRemoveSessionResult(payload: unknown): payload is RemoveSessionResult {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const value = payload as Partial<RemoveSessionResult>;

    return typeof value.success === 'boolean' && typeof value.removedCurrent === 'boolean' && typeof value.removedSessionId === 'string';
}
