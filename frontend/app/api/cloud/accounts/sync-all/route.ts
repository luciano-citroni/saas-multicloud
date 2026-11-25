import { NextResponse } from 'next/server';

import { resolveAccessToken, unauthorizedResponse } from '@/lib/api/proxy-request';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';
import { backendFetch, parseJsonSafe, refreshAccessToken, setAuthCookies } from '@/lib/auth/session';

export async function POST(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const midOrgId = searchParams.get('midOrgId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const backendSearchParams = new URLSearchParams();
    if (midOrgId) {
        backendSearchParams.set('organizationId', midOrgId);
    }

    const backendPath =
        backendSearchParams.size > 0
            ? `/api/cloud/accounts/sync-all?${backendSearchParams.toString()}`
            : '/api/cloud/accounts/sync-all';

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return unauthorizedResponse();

    const send = (accessToken: string) =>
        backendFetch(backendPath, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-organization-id': organizationId,
            },
        });

    let response = await send(resolved.accessToken);
    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);
        if (!refreshResult) return unauthorizedResponse();
        rotatedTokens = refreshResult;
        response = await send(refreshResult.accessToken);
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? {}, { status: response.status });
    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);
    return nextResponse;
}
