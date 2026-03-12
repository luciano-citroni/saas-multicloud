import { NextResponse } from 'next/server';
import { backendFetch, parseJsonSafe, setAuthCookie } from '@/lib/auth/session';

export async function POST(request: Request) {
    const body = await request.json();

    const backendResponse = await backendFetch('/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await parseJsonSafe<Record<string, unknown>>(backendResponse);

    if (!backendResponse.ok) {
        return NextResponse.json(payload ?? { message: 'Erro ao fazer login' }, { status: backendResponse.status });
    }

    const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken : null;

    if (!accessToken) {
        return NextResponse.json({ message: 'Resposta de login invalida' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });
    setAuthCookie(response, accessToken);
    return response;
}
