import { NextResponse } from 'next/server';

import { resolveAccessToken, unauthorizedResponse } from '@/lib/api/proxy-request';
import { backendFetch, refreshAccessToken, setAuthCookies, type AuthTokens } from '@/lib/auth/session';

function pdfResponse(response: Response, bytes: ArrayBuffer, rotatedTokens: AuthTokens | null) {
    const next = new NextResponse(bytes, {
        status: response.status,
        headers: {
            'Content-Type': response.headers.get('Content-Type') ?? 'application/pdf',
            'Content-Disposition': response.headers.get('Content-Disposition') ?? 'attachment; filename="finops-commercial.pdf"',
            'Cache-Control': 'no-store',
        },
    });
    if (rotatedTokens) setAuthCookies(next, rotatedTokens);
    return next;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const forwardParams = new URLSearchParams(searchParams);
    forwardParams.delete('organizationId');
    const query = forwardParams.toString();
    const targetPath = query ? `/api/finops/commercial-report/pdf?${query}` : '/api/finops/commercial-report/pdf';

    const resolved = await resolveAccessToken();
    if (!resolved.accessToken) return unauthorizedResponse();

    const send = (accessToken: string) =>
        backendFetch(targetPath, {
            method: 'GET',
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

    if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: 'Não foi possível gerar o PDF' }));
        const next = NextResponse.json(payload, { status: response.status });
        if (rotatedTokens) setAuthCookies(next, rotatedTokens);
        return next;
    }

    return pdfResponse(response, await response.arrayBuffer(), rotatedTokens);
}
