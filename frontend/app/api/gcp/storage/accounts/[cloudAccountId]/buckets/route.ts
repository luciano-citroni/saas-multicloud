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

type Params = {
    params: Promise<{
        cloudAccountId: string;
    }>;
};

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

    return { accessToken: rotatedTokens.accessToken, refreshToken, rotatedTokens };
}

function withAuthHeaders(accessToken: string, organizationId: string): HeadersInit {
    return {
        Authorization: `Bearer ${accessToken}`,
        'x-organization-id': organizationId,
    };
}

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

export async function GET(request: Request, { params }: Params) {
    const { cloudAccountId } = await params;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();

    if (!resolved.accessToken) {
        return buildUnauthorizedResponse();
    }

    const backendUrl = `/api/gcp/storage/accounts/${cloudAccountId}/buckets`;

    let response = await backendFetch(backendUrl, {
        headers: withAuthHeaders(resolved.accessToken, organizationId),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch(backendUrl, {
            headers: withAuthHeaders(refreshResult.accessToken, organizationId),
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? [], { status: response.status });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}
