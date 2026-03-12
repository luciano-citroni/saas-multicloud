import { NextResponse } from 'next/server';
import { backendFetch, clearAuthCookie, getAccessTokenFromCookies } from '@/lib/auth/session';

export async function POST() {
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
    clearAuthCookie(response);
    return response;
}
