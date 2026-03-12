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

type BackendUser = {
    id?: string;
    name?: string;
    email?: string;
};

type BackendOrganization = {
    id?: string;
    name?: string;
};

function toSlug(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function normalizePayload(userBody: BackendUser | null, organizationsBody: BackendOrganization[] | null) {
    const user = {
        id: userBody?.id ?? '',
        name: userBody?.name ?? 'Usuario',
        email: userBody?.email ?? 'email@teste.com',
    };

    const organizations = Array.isArray(organizationsBody)
        ? organizationsBody
              .filter((organization) => typeof organization?.id === 'string' && typeof organization?.name === 'string')
              .map((organization) => ({
                  id: organization.id as string,
                  name: organization.name as string,
                  slug: toSlug(organization.name as string),
              }))
        : [];

    return {
        user,
        organizations,
    };
}

function fetchContext(accessToken: string) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    return Promise.all([backendFetch('/api/auth/me', { headers }), backendFetch('/api/organization', { headers })]);
}

export async function GET() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ message: 'Nao autenticado' }, { status: 401 });
    }

    let currentAccessToken = accessToken;
    let rotatedTokens: AuthTokens | null = null;

    if (!currentAccessToken && refreshToken) {
        rotatedTokens = await refreshAccessToken(refreshToken);

        if (!rotatedTokens) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        currentAccessToken = rotatedTokens.accessToken;
    }

    if (!currentAccessToken) {
        return NextResponse.json({ message: 'Nao autenticado' }, { status: 401 });
    }

    let [meResponse, organizationsResponse] = await fetchContext(currentAccessToken);

    if (meResponse.status === 401 || organizationsResponse.status === 401) {
        if (!refreshToken) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        rotatedTokens = await refreshAccessToken(refreshToken);

        if (!rotatedTokens) {
            const response = NextResponse.json({ message: 'Sessao expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        [meResponse, organizationsResponse] = await fetchContext(rotatedTokens.accessToken);
    }

    const meBody = await parseJsonSafe<BackendUser>(meResponse);
    const organizationsBody = await parseJsonSafe<BackendOrganization[]>(organizationsResponse);

    if (!meResponse.ok) {
        return NextResponse.json(meBody ?? { message: 'Erro ao carregar usuario' }, { status: meResponse.status });
    }

    if (!organizationsResponse.ok) {
        return NextResponse.json(organizationsBody ?? { message: 'Erro ao carregar organizacoes' }, { status: organizationsResponse.status });
    }

    const response = NextResponse.json(normalizePayload(meBody, organizationsBody));

    if (rotatedTokens) {
        setAuthCookies(response, rotatedTokens);
    }

    return response;
}
