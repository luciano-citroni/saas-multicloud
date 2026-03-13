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

function withAuthHeaders(accessToken: string): HeadersInit {
    return {
        Authorization: `Bearer ${accessToken}`,
    };
}

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

export async function GET() {
    const resolved = await resolveAccessToken();

    if (!resolved.accessToken) {
        return buildUnauthorizedResponse();
    }

    let response = await backendFetch('/api/billing/plans', {
        headers: withAuthHeaders(resolved.accessToken),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch('/api/billing/plans', {
            headers: withAuthHeaders(refreshResult.accessToken),
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? [], { status: response.status });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}
