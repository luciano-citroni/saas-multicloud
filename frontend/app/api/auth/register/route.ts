import { NextResponse } from 'next/server';
import { backendFetch, parseJsonSafe } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const body = await request.json();

    const backendResponse = await backendFetch('/api/auth/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await parseJsonSafe<Record<string, unknown>>(backendResponse);

    if (!backendResponse.ok) {
        return NextResponse.json(payload ?? { message: 'Erro ao registrar' }, {
            status: backendResponse.status,
        });
    }

    // Do not forward user profile details beyond confirmation — client only needs success.
    return NextResponse.json({
        success: true,
        emailVerified: false,
        requiresEmailVerification: true,
    });
}
