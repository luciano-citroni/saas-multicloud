import { NextResponse } from 'next/server';
import { clearAuthCookies, getRefreshTokenFromCookies, refreshAccessToken, setAuthCookies } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const refreshToken = await getRefreshTokenFromCookies();

    if (!refreshToken) {
        return NextResponse.json({ message: 'Sessão ausente' }, { status: 401 });
    }

    const tokens = await refreshAccessToken(refreshToken);

    if (!tokens) {
        const response = NextResponse.json({ message: 'Não foi possível renovar a sessão' }, { status: 401 });
        clearAuthCookies(response);
        return response;
    }

    const response = NextResponse.json({ success: true });
    setAuthCookies(response, tokens);
    return response;
}
