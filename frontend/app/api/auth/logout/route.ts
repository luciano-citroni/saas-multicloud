import { NextResponse } from 'next/server';
import { backendFetch, clearAuthCookies, getAccessTokenFromCookies } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const accessToken = await getAccessTokenFromCookies();

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
