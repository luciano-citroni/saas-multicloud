import { NextResponse } from 'next/server';
import { clearAuthCookie, getAccessTokenFromCookies, refreshAccessToken, setAuthCookie } from '@/lib/auth/session';

export async function POST() {
    const currentToken = await getAccessTokenFromCookies();

    if (!currentToken) {
        return NextResponse.json({ message: 'Sessao ausente' }, { status: 401 });
    }

    const newToken = await refreshAccessToken(currentToken);

    if (!newToken) {
        const response = NextResponse.json({ message: 'Nao foi possivel renovar a sessao' }, { status: 401 });
        clearAuthCookie(response);
        return response;
    }

    const response = NextResponse.json({ success: true });
    setAuthCookie(response, newToken);
    return response;
}
