import { NextResponse } from 'next/server';
import { backendFetch, extractAuthTokens, parseJsonSafe, setAuthCookies } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem nao permitida' }, { status: 403 });
    }

    const body = await request.json();
    const code = typeof body?.code === 'string' ? body.code : null;

    if (!code) {
        return NextResponse.json({ message: 'Codigo ausente' }, { status: 400 });
    }

    const backendResponse = await backendFetch('/api/auth/google/exchange', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
    });

    const payload = await parseJsonSafe<Record<string, unknown>>(backendResponse);

    if (!backendResponse.ok) {
        return NextResponse.json(payload ?? { message: 'Nao foi possivel concluir o login com Google' }, { status: backendResponse.status });
    }

    const tokens = extractAuthTokens(payload);

    if (!tokens) {
        return NextResponse.json({ message: 'Resposta de login invalida' }, { status: 500 });
    }

    const response = NextResponse.json({ success: true });
    setAuthCookies(response, tokens);
    return response;
}
