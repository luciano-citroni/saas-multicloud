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
    return {
        accessToken: rotatedTokens.accessToken,
        refreshToken: rotatedTokens.refreshToken,
        rotatedTokens,
    };
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

    const forwardParams = new URLSearchParams(searchParams);
    forwardParams.delete('organizationId');
    // BFF-only flag used by /api/finops/budgets/status — not a Nest query param.
    forwardParams.delete('onlyOrganization');
    const query = forwardParams.toString();
    const targetPath = query ? `${backendPath}?${query}` : backendPath;

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return unauthorizedResponse();

    const body =
        method === 'GET' || method === 'DELETE' ? undefined : await request.text();

    const send = (accessToken: string) =>
        backendFetch(targetPath, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(organizationId ? { 'x-organization-id': organizationId } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body || undefined,
        });

    let response = await send(resolved.accessToken);
    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return unauthorizedResponse();

        rotatedTokens = refreshResult;
        response = await send(refreshResult.accessToken);
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse =
        response.status === 204
            ? new NextResponse(null, { status: 204 })
            : NextResponse.json(payload ?? {}, { status: response.status });

    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    return nextResponse;
}
