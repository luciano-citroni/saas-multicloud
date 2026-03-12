import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/constants';

const isProduction = process.env.NODE_ENV === 'production';

export function getBackendUrl(): string {
    return process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4880';
}

export async function getAccessTokenFromCookies(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

export function setAuthCookie(response: NextResponse, accessToken: string) {
    response.cookies.set({
        name: ACCESS_TOKEN_COOKIE,
        value: accessToken,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
    });
}

export function clearAuthCookie(response: NextResponse) {
    response.cookies.set({
        name: ACCESS_TOKEN_COOKIE,
        value: '',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
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

export async function refreshAccessToken(currentToken: string): Promise<string | null> {
    const refreshResponse = await backendFetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: currentToken }),
    });

    if (!refreshResponse.ok) {
        return null;
    }

    const refreshBody = await parseJsonSafe<{ accessToken?: string }>(refreshResponse);
    return refreshBody?.accessToken ?? null;
}
