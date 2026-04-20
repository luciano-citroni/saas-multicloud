import { NextResponse } from 'next/server';
import { backendFetch, clearAuthCookies, getAccessTokenFromCookies, getRefreshTokenFromCookies, parseJsonSafe, refreshAccessToken, setAuthCookies } from '@/lib/auth/session';
import type { AuthTokens } from '@/lib/auth/session';

async function resolveAccessToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();
    if (!accessToken && !refreshToken) return { accessToken: null, rotatedTokens: null as AuthTokens | null };
    if (accessToken) return { accessToken, rotatedTokens: null as AuthTokens | null };
    if (!refreshToken) return { accessToken: null, rotatedTokens: null as AuthTokens | null };
    const rotatedTokens = await refreshAccessToken(refreshToken);
    if (!rotatedTokens) return { accessToken: null, rotatedTokens: null as AuthTokens | null };
    return { accessToken: rotatedTokens.accessToken, rotatedTokens };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const cloudAccountId = searchParams.get('cloudAccountId');
    const region = searchParams.get('region');
    const os = searchParams.get('os');

    if (!organizationId || !cloudAccountId || !region || !os) {
        return NextResponse.json({ message: 'organizationId, cloudAccountId, region e os são obrigatórios' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) {
        const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
        clearAuthCookies(res);
        return res;
    }

    const qs = new URLSearchParams({ cloudAccountId, region, os });
    const response = await backendFetch(`/api/automation/resources/ami?${qs.toString()}`, {
        headers: {
            Authorization: `Bearer ${resolved.accessToken}`,
            'x-organization-id': organizationId,
        },
    });

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? {}, { status: response.status });
    if (resolved.rotatedTokens) setAuthCookies(nextResponse, resolved.rotatedTokens);
    return nextResponse;
}
