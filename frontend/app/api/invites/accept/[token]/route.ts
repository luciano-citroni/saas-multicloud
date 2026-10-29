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

type RouteContext = { params: Promise<{ token: string }> };

async function resolveAccessToken() {
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

export async function GET(_: Request, { params }: RouteContext) {
    const { token } = await params;
    if (!token) return NextResponse.json({ message: 'Token inválido' }, { status: 400 });

    const response = await backendFetch(`/api/organization/invites/accept/${encodeURIComponent(token)}`);
    const payload = await parseJsonSafe<unknown>(response);
    return NextResponse.json(payload ?? { message: 'Erro ao processar convite' }, { status: response.status });
}

export async function POST(request: Request, { params }: RouteContext) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const { token } = await params;
    if (!token) return NextResponse.json({ message: 'Token inválido' }, { status: 400 });

    const { accessToken, rotatedTokens } = await resolveAccessToken();
    if (!accessToken) {
        const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
        clearAuthCookies(res);
        return res;
    }

    const response = await backendFetch(`/api/organization/invites/accept/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao processar convite' }, {
        status: response.status,
    });

    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    if (response.status === 401) clearAuthCookies(nextResponse);

    return nextResponse;
}
