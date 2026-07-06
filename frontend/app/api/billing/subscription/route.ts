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
import { hasTrustedOrigin } from '@/lib/auth/request-origin';

async function resolveToken() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

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

function buildUnauthorizedResponse() {
    const response = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
    clearAuthCookies(response);
    return response;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const checkoutSessionId = searchParams.get('checkoutSessionId');

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const { accessToken, refreshToken, rotatedTokens: initialRotated } = await resolveToken();

    if (!accessToken) {
        return buildUnauthorizedResponse();
    }

    const backendPath = checkoutSessionId
        ? `/api/billing/subscription?checkoutSessionId=${encodeURIComponent(checkoutSessionId)}`
        : '/api/billing/subscription';

    const baseHeaders = {
        Authorization: `Bearer ${accessToken}`,
        'x-organization-id': organizationId,
    };

    let response = await backendFetch(backendPath, { headers: baseHeaders });

    let rotatedTokens = initialRotated;

    if (response.status === 401 && refreshToken) {
        const refreshResult = await refreshAccessToken(refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await backendFetch(backendPath, {
            headers: {
                Authorization: `Bearer ${refreshResult.accessToken}`,
                'x-organization-id': organizationId,
            },
        });
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? null, { status: response.status });

    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);

    return nextResponse;
}

export async function PUT(request: Request) {
    if (!hasTrustedOrigin(request)) {
        return NextResponse.json({ message: 'Origem não permitida' }, { status: 403 });
    }

    const body = (await request.json()) as { organizationId?: string; priceId?: string };
    const { organizationId, priceId } = body;

    if (!organizationId) {
        return NextResponse.json({ message: 'organizationId é obrigatório' }, { status: 400 });
    }

    const { accessToken, refreshToken, rotatedTokens: initialRotated } = await resolveToken();

    if (!accessToken) {
        return buildUnauthorizedResponse();
    }

    const makeRequest = (token: string) =>
        backendFetch('/api/billing/subscription', {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'x-organization-id': organizationId,
            },
            body: JSON.stringify({ priceId }),
        });

    let response = await makeRequest(accessToken);

    let rotatedTokens = initialRotated;

    if (response.status === 401 && refreshToken) {
        const refreshResult = await refreshAccessToken(refreshToken);

        if (!refreshResult) {
            return buildUnauthorizedResponse();
        }

        rotatedTokens = refreshResult;

        response = await makeRequest(refreshResult.accessToken);
    }

    const payload = await parseJsonSafe<unknown>(response);
    const nextResponse = NextResponse.json(payload ?? { message: 'Erro ao atualizar plano' }, { status: response.status });

    if (rotatedTokens) setAuthCookies(nextResponse, rotatedTokens);

    return nextResponse;
}
