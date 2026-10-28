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

type RouteContext = { params: Promise<{ organizationId: string; userId: string; targetOrganizationId: string }> };

async function resolveAccessToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };
    if (accessToken) return { accessToken, refreshToken, rotatedTokens: null as AuthTokens | null };
    if (!refreshToken) return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };

    const rotatedTokens = await refreshAccessToken(refreshToken);
    if (!rotatedTokens) return { accessToken: null, refreshToken, rotatedTokens: null as AuthTokens | null };

    return { accessToken: rotatedTokens.accessToken, refreshToken: rotatedTokens.refreshToken, rotatedTokens };
}

function buildUnauthorizedResponse() {
    const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(res);
    return res;
}

export async function DELETE(request: Request, { params }: RouteContext) {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });

    const { userId, targetOrganizationId } = await params;
    if (!userId || !targetOrganizationId) {
        return NextResponse.json({ message: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return buildUnauthorizedResponse();

    const headers = { Authorization: `Bearer ${resolved.accessToken}` };

    let response = await backendFetch(`/api/organization/members/${encodeURIComponent(userId)}/orgs/${encodeURIComponent(targetOrganizationId)}`, {
        method: 'DELETE',
        headers,
    });
    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return buildUnauthorizedResponse();

        rotatedTokens = refreshResult;
        response = await backendFetch(`/api/organization/members/${encodeURIComponent(userId)}/orgs/${encodeURIComponent(targetOrganizationId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${refreshResult.accessToken}` },
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao remover usuário da organização' }, { status: response.status });

    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);

    return nextResponse;
}
