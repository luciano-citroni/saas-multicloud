import { NextResponse } from 'next/server';
import { backendFetch, parseJsonSafe } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';

    if (!token) {
        return NextResponse.json({ message: 'Token é obrigatório' }, { status: 400 });
    }

    const backendResponse = await backendFetch('/api/auth/email/verify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
    });

    const payload = await parseJsonSafe<Record<string, unknown>>(backendResponse);

    return NextResponse.json(payload ?? {}, { status: backendResponse.status });
}
