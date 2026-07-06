import { NextResponse } from 'next/server';
import { backendFetch, parseJsonSafe } from '@/lib/auth/session';

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_: Request, { params }: RouteContext) {
    const { token } = await params;
    if (!token) return NextResponse.json({ message: 'Token inválido' }, { status: 400 });

    const response = await backendFetch(`/api/organization/invites/accept/${encodeURIComponent(token)}`);
    const payload = await parseJsonSafe<unknown>(response);
    return NextResponse.json(payload ?? { message: 'Erro ao processar convite' }, { status: response.status });
}
