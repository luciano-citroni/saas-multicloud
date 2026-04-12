import { NextResponse } from 'next/server';
import {
    backendFetch,
    clearAuthCookies,
    getAccessTokenFromCookies,
    getRefreshTokenFromCookies,
    refreshAccessToken,
    setAuthCookies,
    type AuthTokens,
} from '@/lib/auth/session';
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

type Params = {
    params: Promise<{
        cloudAccountId: string;
        jobId: string;
    }>;
};

async function resolveAccessToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) {
        return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };
    }

    if (accessToken) {
        return { accessToken, refreshToken, rotatedTokens: null as AuthTokens | null };
    }

    if (!refreshToken) {
        return { accessToken: null, refreshToken: null, rotatedTokens: null as AuthTokens | null };
    }

    const rotatedTokens = await refreshAccessToken(refreshToken);

    if (!rotatedTokens) {
        return { accessToken: null, refreshToken, rotatedTokens: null as AuthTokens | null };
    }

    return { accessToken: rotatedTokens.accessToken, refreshToken, rotatedTokens };
}

function withAuthHeaders(accessToken: string, organizationId: string): HeadersInit {
    return { Authorization: `Bearer ${accessToken}`, 'x-organization-id': organizationId };
}

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

export async function GET(request: Request, { params }: Params) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const { cloudAccountId, jobId } = await params;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const resolved = await resolveAccessToken();

    if (!resolved.accessToken) {
        return buildUnauthorizedResponse();
    }

    let response = await backendFetch(`/api/gcp/assessment/accounts/${cloudAccountId}/assessment-jobs/${jobId}/download`, {
        headers: withAuthHeaders(resolved.accessToken, organizationId),
    });

    const rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        response = await backendFetch(`/api/gcp/assessment/accounts/${cloudAccountId}/assessment-jobs/${jobId}/download`, {
            headers: withAuthHeaders(refreshResult.accessToken, organizationId),
        });
    }

    if (!response.ok) {
        return NextResponse.json({ message: 'Relatório Excel não disponível.' }, { status: response.status });
    }

    const contentDisposition = response.headers.get('content-disposition') ?? `attachment; filename="gcp-assessment-${jobId}.xlsx"`;
    const body = await response.arrayBuffer();

    const nextResponse = new NextResponse(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': contentDisposition,
        },
    });

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}
