import { NextResponse } from 'next/server';
import {
    backendFetch,
    clearAuthCookies,
    refreshAccessToken,
    setAuthCookies,
    type AuthTokens,
} from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';
import { resolveAccessToken } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) {
        const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
        clearAuthCookies(res);
        return res;
    }

    const body = await request.text();

    const send = (accessToken: string) =>
        backendFetch(`/api/ai-chat/conversations/${encodeURIComponent(id)}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-organization-id': organizationId,
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
            },
            body,
        });

    let upstream = await send(resolved.accessToken);
    let rotatedTokens: AuthTokens | null = resolved.rotatedTokens;

    if (upstream.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) {
            const res = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
            clearAuthCookies(res);
            return res;
        }
        rotatedTokens = refreshResult;
        upstream = await send(refreshResult.accessToken);
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8';
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'no-cache, no-transform');
    headers.set('Connection', 'keep-alive');

    const nextResponse = new NextResponse(upstream.body, {
        status: upstream.status,
        headers,
    });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}
