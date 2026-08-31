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

export async function resolveAccessToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) {
        return { accessToken: null, rotatedTokens: null as AuthTokens | null };
    }
    if (accessToken) {
        return { accessToken, rotatedTokens: null as AuthTokens | null };
    }
    if (!refreshToken) {
        return { accessToken: null, rotatedTokens: null as AuthTokens | null };
    }
    const rotatedTokens = await refreshAccessToken(refreshToken);
    if (!rotatedTokens) {
        return { accessToken: null, rotatedTokens: null as AuthTokens | null };
    }
    return { accessToken: rotatedTokens.accessToken, rotatedTokens };
}

export function unauthorizedResponse() {
    const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(res);
    return res;
}

export async function proxyToBackend(
    request: Request,
    backendPath: string,
    options: { method?: string; requireOrg?: boolean } = {},
) {
    const { method = 'GET', requireOrg = true } = options;

    if (method !== 'GET' && !hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (requireOrg && !organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return unauthorizedResponse();

    const body =
        method === 'GET' || method === 'DELETE' ? undefined : await request.text();

    const response = await backendFetch(backendPath, {
        method,
        headers: {
            Authorization: `Bearer ${resolved.accessToken}`,
            ...(organizationId ? { 'x-organization-id': organizationId } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body || undefined,
    });

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse =
        response.status === 204
            ? new NextResponse(null, { status: 204 })
            : NextResponse.json(payload ?? {}, { status: response.status });

    if (resolved.rotatedTokens) setAuthCookies(nextResponse, resolved.rotatedTokens);
    return nextResponse;
}
