import { NextResponse } from 'next/server';
import { backendFetch, parseJsonSafe } from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const body = await request.json();

    const backendResponse = await backendFetch('/api/auth/email/resend-by-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await parseJsonSafe<Record<string, unknown>>(backendResponse);

    return NextResponse.json(payload ?? { success: true }, { status: backendResponse.status });
}
