import { NextResponse } from 'next/server';
import { backendFetch, extractAuthTokens, parseJsonSafe, setAuthCookies } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem nao permitida' }, { status: 403 });
    }

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

    const tokens = extractAuthTokens(payload);

    if (!tokens) {
        return NextResponse.json({ message: 'Resposta de login invalida' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });
    setAuthCookies(response, tokens);
    return response;
}
