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

export async function GET() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ message: 'Nao autenticado' }, { status: 401 });
    }

    const fetchUser = (token: string) =>
        backendFetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

    let currentAccessToken = accessToken;
    let rotatedTokens: AuthTokens | null = null;

    if (!currentAccessToken && refreshToken) {
        rotatedTokens = await refreshAccessToken(refreshToken);

        if (!rotatedTokens) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        currentAccessToken = rotatedTokens.accessToken;
    }

    if (!currentAccessToken) {
        return NextResponse.json({ message: 'Nao autenticado' }, { status: 401 });
    }

    let userResponse = await fetchUser(currentAccessToken);

    if (userResponse.status === 401) {
        if (!refreshToken) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        rotatedTokens = await refreshAccessToken(refreshToken);

        if (!rotatedTokens) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        userResponse = await fetchUser(rotatedTokens.accessToken);

        if (!userResponse.ok) {
            const failedPayload = await parseJsonSafe<Record<string, unknown>>(userResponse);
            return NextResponse.json(failedPayload ?? { message: 'Erro ao carregar usuario' }, { status: userResponse.status });
        }

        const refreshedPayload = await parseJsonSafe<Record<string, unknown>>(userResponse);
        const response = NextResponse.json(refreshedPayload ?? {});
        setAuthCookies(response, rotatedTokens);
        return response;
    }

    const payload = await parseJsonSafe<Record<string, unknown>>(userResponse);

    if (!userResponse.ok) {
        return NextResponse.json(payload ?? { message: 'Erro ao carregar usuario' }, { status: userResponse.status });
    }

    if (!rotatedTokens) {
        return NextResponse.json(payload ?? {});
    }

    const response = NextResponse.json(payload ?? {});
    setAuthCookies(response, rotatedTokens);
    return response;
}
