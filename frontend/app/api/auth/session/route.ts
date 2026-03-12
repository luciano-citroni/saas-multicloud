import { NextResponse } from 'next/server';
import { setAuthCookie } from '@/lib/auth/session';

export async function POST(request: Request) {
    const body = await request.json();
    const accessToken = typeof body?.token === 'string' ? body.token : null;

    if (!accessToken) {
        return NextResponse.json({ message: 'Token ausente' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });
    setAuthCookie(response, accessToken);
    return response;
}
