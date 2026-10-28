import { NextResponse } from 'next/server';
import { backendFetch, clearAuthCookies, getAccessTokenFromCookies, getRefreshTokenFromCookies, refreshAccessToken } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    let accessToken = await getAccessTokenFromCookies();

    if (!accessToken) {
        const refreshToken = await getRefreshTokenFromCookies();
        if (refreshToken) {
            const refreshed = await refreshAccessToken(refreshToken).catch(() => null);
            accessToken = refreshed?.accessToken ?? null;
        }
    }

    if (accessToken) {
        await backendFetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookies(response);
    return response;
}
