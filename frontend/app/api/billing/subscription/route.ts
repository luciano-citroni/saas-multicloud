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

function withAuthHeaders(accessToken: string, organizationId: string, headers?: HeadersInit): HeadersInit {
    return {
        ...(headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
        'x-organization-id': organizationId,
    };
}

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId e obrigatorio' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();

    if (!resolved.accessToken) {
        return buildUnauthorizedResponse();
    }

    let response = await backendFetch('/api/billing/subscription', {
        headers: withAuthHeaders(resolved.accessToken, organizationId),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch('/api/billing/subscription', {
            headers: withAuthHeaders(refreshResult.accessToken, organizationId),
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? null, { status: response.status });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}

export async function PUT(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem nao permitida' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId e obrigatorio' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();

    if (!resolved.accessToken) {
        return buildUnauthorizedResponse();
    }

    const body = await request.json();

    let response = await backendFetch('/api/billing/subscription', {
        method: 'PUT',
        headers: withAuthHeaders(resolved.accessToken, organizationId, {
            'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch('/api/billing/subscription', {
            method: 'PUT',
            headers: withAuthHeaders(refreshResult.accessToken, organizationId, {
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify(body),
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao atualizar plano' }, { status: response.status });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}
