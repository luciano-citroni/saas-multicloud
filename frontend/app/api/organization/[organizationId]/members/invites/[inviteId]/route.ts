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

type RouteContext = { params: Promise<{ organizationId: string; inviteId: string }> };

async function resolveAccessToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };
    if (accessToken) return { accessToken, refreshToken, rotatedTokens: null as AuthTokens | null };
    if (!refreshToken) return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };

    const rotatedTokens = await refreshAccessToken(refreshToken);
    if (!rotatedTokens) return { accessToken: null, refreshToken, rotatedTokens: null as AuthTokens | null };

    return { accessToken: rotatedTokens.accessToken, refreshToken, rotatedTokens };
}

function buildUnauthorizedResponse() {
    const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(res);
    return res;
}

export async function POST(request: Request, { params }: RouteContext) {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });

    const { organizationId, inviteId } = await params;
    if (!organizationId || !inviteId) return NextResponse.json({ message: 'Parâmetros obrigatórios ausentes' }, { status: 400 });

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return buildUnauthorizedResponse();

    const headers = { Authorization: `Bearer ${resolved.accessToken}`, 'x-organization-id': organizationId };

    let response = await backendFetch(`/api/organization/members/invites/${encodeURIComponent(inviteId)}/resend`, { method: 'POST', headers });
    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return buildUnauthorizedResponse();
        rotatedTokens = refreshResult;
        response = await backendFetch(`/api/organization/members/invites/${encodeURIComponent(inviteId)}/resend`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${refreshResult.accessToken}`, 'x-organization-id': organizationId },
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao reenviar convite' }, { status: response.status });
    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    return nextResponse;
}

export async function DELETE(request: Request, { params }: RouteContext) {
    if (!hasTrustedOrigin(request)) return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });

    const { organizationId, inviteId } = await params;
    if (!organizationId || !inviteId) return NextResponse.json({ message: 'Parâmetros obrigatórios ausentes' }, { status: 400 });

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return buildUnauthorizedResponse();

    const headers = { Authorization: `Bearer ${resolved.accessToken}`, 'x-organization-id': organizationId };

    let response = await backendFetch(`/api/organization/members/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE', headers });
    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return buildUnauthorizedResponse();
        rotatedTokens = refreshResult;
        response = await backendFetch(`/api/organization/members/invites/${encodeURIComponent(inviteId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${refreshResult.accessToken}`, 'x-organization-id': organizationId },
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao cancelar convite' }, { status: response.status });
    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    return nextResponse;
}
