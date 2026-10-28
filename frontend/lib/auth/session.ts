import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_MAX_AGE_SECONDS, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_MAX_AGE_SECONDS } from '@/lib/auth/constants';

const isProduction = process.env.NODE_ENV === 'production';
const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;
const REFRESH_REPLAY_MS = 16 * 60 * 1000;
const REFRESH_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type RefreshReplayEntry = {
    tokens: AuthTokens;
    expiresAt: number;
};

const refreshReplay = new Map<string, RefreshReplayEntry>();
const refreshInflight = new Map<string, Promise<AuthTokens | null>>();

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

export function getBackendPublicUrl(): string {
    return process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? 'http://localhost:4880';
}

export function getBackendInternalUrl(): string {
    return process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4880';
}

function decodeJwtPayload(token: string): { exp?: number } | null {
    const segment = token.split('.')[1];
    if (!segment) return null;

    try {
        const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { exp?: number };
        return payload && typeof payload === 'object' ? payload : null;
    } catch {
        return null;
    }
}

function isAccessTokenExpiring(token: string, now = Date.now()): boolean {
    const payload = decodeJwtPayload(token);
    if (!payload) return true;
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= now + ACCESS_TOKEN_REFRESH_SKEW_MS;
}

export async function getAccessTokenFromCookies(): Promise<string | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
    if (!token || isAccessTokenExpiring(token)) {
        return null;
    }

    return token;
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
    return fetch(`${getBackendInternalUrl()}${path}`, {
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

function rememberRefreshReplay(refreshToken: string, tokens: AuthTokens) {
    refreshReplay.set(refreshToken, {
        tokens,
        expiresAt: Date.now() + REFRESH_REPLAY_MS,
    });

    if (refreshReplay.size <= 500) return;

    const now = Date.now();
    for (const [key, entry] of refreshReplay) {
        if (entry.expiresAt <= now) {
            refreshReplay.delete(key);
        }
    }
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class RefreshRejectedError extends Error {
    constructor(readonly status: number) {
        super(`Refresh failed with status ${status}`);
    }
}

async function requestRefreshedTokens(refreshToken: string): Promise<AuthTokens | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const refreshResponse = await backendFetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken }),
            });

            if (refreshResponse.status === 401) {
                return null;
            }

            if (!refreshResponse.ok) {
                if (!REFRESH_RETRYABLE_STATUSES.has(refreshResponse.status)) {
                    throw new RefreshRejectedError(refreshResponse.status);
                }

                if (attempt === 2) {
                    throw new RefreshRejectedError(refreshResponse.status);
                }

                await delay(150 * (attempt + 1));
                continue;
            }

            const refreshBody = await parseJsonSafe<Record<string, unknown>>(refreshResponse);
            const tokens = extractAuthTokens(refreshBody);
            if (!tokens) {
                throw new Error('Refresh response missing tokens');
            }

            return tokens;
        } catch (error) {
            if (error instanceof RefreshRejectedError) {
                throw error;
            }

            lastError = error;
            if (attempt === 2) {
                throw error;
            }

            await delay(150 * (attempt + 1));
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Refresh failed');
}

export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    const cached = refreshReplay.get(refreshToken);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.tokens;
    }

    if (cached) {
        refreshReplay.delete(refreshToken);
    }

    const pending = refreshInflight.get(refreshToken);
    if (pending) {
        return pending;
    }

    const promise = requestRefreshedTokens(refreshToken)
        .then((tokens) => {
            if (tokens) {
                rememberRefreshReplay(refreshToken, tokens);
            }

            return tokens;
        })
        .finally(() => {
            refreshInflight.delete(refreshToken);
        });

    refreshInflight.set(refreshToken, promise);
    return promise;
}
