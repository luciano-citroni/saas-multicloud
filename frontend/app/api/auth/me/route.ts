import { NextResponse } from 'next/server';
import {
    backendFetch,
    clearAuthCookies,
    getAccessTokenFromCookies,
    getRefreshTokenFromCookies,
    parseJsonSafe,
    refreshAccessToken,
    setAuthCookies,
    type AuthTokens,
} from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

async function resolveAccessToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) {
        return {
            accessToken: null,
            refreshToken: null,
            rotatedTokens: null as AuthTokens | null,
        };
    }

    if (accessToken) {
        return {
            accessToken,
            refreshToken,
            rotatedTokens: null as AuthTokens | null,
        };
    }

    if (!refreshToken) {
        return {
            accessToken: null,
            refreshToken: null,
            rotatedTokens: null as AuthTokens | null,
        };
    }

    const rotatedTokens = await refreshAccessToken(refreshToken);

    if (!rotatedTokens) {
        return {
            accessToken: null,
            refreshToken,
            rotatedTokens: null as AuthTokens | null,
        };
    }

    return {
        accessToken: rotatedTokens.accessToken,
        refreshToken,
        rotatedTokens,
    };
}

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

function withAuthHeaders(accessToken: string, headers?: HeadersInit): HeadersInit {
    return {
        ...(headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
    };
}

async function proxyWithRefresh(options: { path: string; method: 'GET' | 'PATCH'; body?: string }) {
    const resolved = await resolveAccessToken();

    if (!resolved.accessToken) {
        return buildUnauthorizedResponse();
    }

    let response = await backendFetch(options.path, {
        method: options.method,
        headers: withAuthHeaders(
            resolved.accessToken,
            options.method === 'PATCH'
                ? {
                      'Content-Type': 'application/json',
                  }
                : undefined
        ),
        body: options.body,
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch(options.path, {
            method: options.method,
            headers: withAuthHeaders(
                refreshResult.accessToken,
                options.method === 'PATCH'
                    ? {
                          'Content-Type': 'application/json',
                      }
                    : undefined
            ),
            body: options.body,
        });
    }

    const payload = await parseJsonSafe<Record<string, unknown>>(response);
    const nextResponse = NextResponse.json(payload ?? {}, { status: response.status });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}

export async function GET() {
    return proxyWithRefresh({
        path: '/api/auth/me',
        method: 'GET',
    });
}

export async function PATCH(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const body = await request.json();

    return proxyWithRefresh({
        path: '/api/auth/me',
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}
