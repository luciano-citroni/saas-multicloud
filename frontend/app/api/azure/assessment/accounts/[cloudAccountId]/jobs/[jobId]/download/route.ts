import { NextResponse } from 'next/server';
import {
    backendFetch,
    clearAuthCookies,
    getAccessTokenFromCookies,
    getRefreshTokenFromCookies,
    parseJsonSafe,
    refreshAccessToken,
    setAuthCookies,
    type AuthTokens,
} from '@/lib/auth/session';

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

    return { accessToken: rotatedTokens.accessToken, refreshToken: rotatedTokens.refreshToken, rotatedTokens };
}

function withAuthHeaders(accessToken: string, organizationId: string): HeadersInit {
    return { Authorization: `Bearer ${accessToken}`, 'x-organization-id': organizationId };
}

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

function buildFileResponse(upstream: Response): NextResponse {
    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    const contentDisposition = upstream.headers.get('content-disposition');
    const contentLength = upstream.headers.get('content-length');

    if (contentType) {
        headers.set('content-type', contentType);
    }

    if (contentDisposition) {
        headers.set('content-disposition', contentDisposition);
    }

    if (contentLength) {
        headers.set('content-length', contentLength);
    }

    return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function GET(request: Request, { params }: Params) {
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

    let response = await backendFetch(`/api/azure/assessment/accounts/${cloudAccountId}/jobs/${jobId}/download`, {
        headers: withAuthHeaders(resolved.accessToken, organizationId),
    });

    let rotatedTokens = resolved.rotatedTokens;

    if (response.status === 401 && resolved.refreshToken) {
        const refreshResult = await refreshAccessToken(resolved.refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch(`/api/azure/assessment/accounts/${cloudAccountId}/jobs/${jobId}/download`, {
            headers: withAuthHeaders(refreshResult.accessToken, organizationId),
        });
    }

    if (!response.ok) {
        const payload = await parseJsonSafe<unknown>(response);
        const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao baixar relatório Azure' }, { status: response.status });

        if (rotatedTokens) {
            setAuthCookies(nextResponse, rotatedTokens);
        }

        return nextResponse;
    }

    const nextResponse = buildFileResponse(response);

    if (rotatedTokens) {
        setAuthCookies(nextResponse, rotatedTokens);
    }

    return nextResponse;
}
