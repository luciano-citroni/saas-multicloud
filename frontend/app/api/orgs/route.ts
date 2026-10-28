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
        return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };
    }

    if (accessToken) {
        return { accessToken, refreshToken, rotatedTokens: null as AuthTokens | null };
    }

    if (!refreshToken) {
        return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };
    }

    const rotatedTokens = await refreshAccessToken(refreshToken);

    if (!rotatedTokens) {
        return { accessToken: null, refreshToken, rotatedTokens: null as AuthTokens | null };
    }

    return { accessToken: rotatedTokens.accessToken, refreshToken: rotatedTokens.refreshToken, rotatedTokens };
}

function withAuthHeaders(accessToken: string, tenantId: string, extra?: HeadersInit): HeadersInit {
    return {
        ...(extra ?? {}),
        Authorization: `Bearer ${accessToken}`,
        'x-organization-id': tenantId,
    };
}

function buildUnauthorizedResponse() {
    const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(res);
    return res;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('organizationId');

    if (!tenantId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return buildUnauthorizedResponse();

    const backendUrl = '/api/organizations';

    let response = await backendFetch(backendUrl, {
        headers: withAuthHeaders(resolved.accessToken, tenantId),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return buildUnauthorizedResponse();
        rotatedTokens = refreshResult;
        response = await backendFetch(backendUrl, {
            headers: withAuthHeaders(refreshResult.accessToken, tenantId),
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? [], { status: response.status });
    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    return nextResponse;
}

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('organizationId');

    if (!tenantId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return buildUnauthorizedResponse();

    const body = await request.json();

    let response = await backendFetch('/api/organizations', {
        method: 'POST',
        headers: withAuthHeaders(resolved.accessToken, tenantId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return buildUnauthorizedResponse();
        rotatedTokens = refreshResult;
        response = await backendFetch('/api/organizations', {
            method: 'POST',
            headers: withAuthHeaders(refreshResult.accessToken, tenantId, { 'Content-Type': 'application/json' }),
            body: JSON.stringify(body),
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao criar grupo' }, { status: response.status });
    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    return nextResponse;
}
