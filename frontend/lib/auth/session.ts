import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_MAX_AGE_SECONDS, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_MAX_AGE_SECONDS } from '@/lib/auth/constants';

const isProduction = process.env.NODE_ENV === 'production';

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export function getBackendUrl(): string {
    return process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4880';
}

export async function getAccessTokenFromCookies(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

export async function getRefreshTokenFromCookies(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null;
}

function buildCookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax' as const,
        path: '/',
        maxAge,
    };
}

export function setAuthCookies(response: NextResponse, tokens: AuthTokens) {
    response.cookies.set({
        name: ACCESS_TOKEN_COOKIE,
        value: tokens.accessToken,
        ...buildCookieOptions(ACCESS_TOKEN_MAX_AGE_SECONDS),
    });

    response.cookies.set({
        name: REFRESH_TOKEN_COOKIE,
        value: tokens.refreshToken,
        ...buildCookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS),
    });
}

export function clearAuthCookies(response: NextResponse) {
    response.cookies.set({
        name: ACCESS_TOKEN_COOKIE,
        value: '',
        ...buildCookieOptions(0),
    });

    response.cookies.set({
        name: REFRESH_TOKEN_COOKIE,
        value: '',
        ...buildCookieOptions(0),
    });
}

export async function parseJsonSafe<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${getBackendUrl()}${path}`, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
        },
        cache: 'no-store',
    });
}

export function extractAuthTokens(payload: Record<string, unknown> | null): AuthTokens | null {
    const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : null;
    const refreshToken = typeof payload?.refreshToken === 'string' ? payload.refreshToken : null;

    if (!accessToken || !refreshToken) {
        return null;
    }

    return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    const refreshResponse = await backendFetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResponse.ok) {
        return null;
    }

    const refreshBody = await parseJsonSafe<Record<string, unknown>>(refreshResponse);
    return extractAuthTokens(refreshBody);
}
