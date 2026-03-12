import { NextResponse } from 'next/server';
import { backendFetch, clearAuthCookie, getAccessTokenFromCookies, parseJsonSafe, refreshAccessToken, setAuthCookie } from '@/lib/auth/session';

export async function GET() {
    const accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
        return NextResponse.json({ message: 'Nao autenticado' }, { status: 401 });
    }

    const fetchUser = (token: string) =>
        backendFetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

    let userResponse = await fetchUser(accessToken);

    if (userResponse.status === 401) {
        const newToken = await refreshAccessToken(accessToken);

        if (!newToken) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookie(response);
            return response;
        }

        userResponse = await fetchUser(newToken);

        if (!userResponse.ok) {
            const failedPayload = await parseJsonSafe<Record<string, unknown>>(userResponse);
            return NextResponse.json(failedPayload ?? { message: 'Erro ao carregar usuario' }, { status: userResponse.status });
        }

        const refreshedPayload = await parseJsonSafe<Record<string, unknown>>(userResponse);
        const response = NextResponse.json(refreshedPayload ?? {});
        setAuthCookie(response, newToken);
        return response;
    }

    const payload = await parseJsonSafe<Record<string, unknown>>(userResponse);

    if (!userResponse.ok) {
        return NextResponse.json(payload ?? { message: 'Erro ao carregar usuario' }, { status: userResponse.status });
    }

    return NextResponse.json(payload ?? {});
}
