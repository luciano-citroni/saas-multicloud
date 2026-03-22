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
    currentRole?: string;
    current_role?: string;
    maxCloudAccounts?: number;
    maxUsers?: number;
    max_cloud_accounts?: number;
    max_users?: number;
    plans?: unknown;
};

type PaginatedOrganizationsPayload = {
    items?: BackendOrganization[];
    pagination?: {
        hasNextPage?: boolean;
    };
};

const ORGANIZATIONS_PAGE_SIZE = 100;

function parseOrganizationPlans(plans: unknown): string[] {
    const normalize = (values: string[]): string[] => {
        const normalized = values.map((value) => value.trim().toLowerCase()).filter(Boolean);

        if (normalized.includes('*')) {
            return ['*'];
        }

        return Array.from(new Set(normalized));
    };

    if (Array.isArray(plans)) {
        return normalize(plans.filter((entry): entry is string => typeof entry === 'string'));
    }

    if (typeof plans !== 'string') {
        return [];
    }

    const raw = plans.trim();
    if (!raw) {
        return [];
    }

    if (raw === '*') {
        return ['*'];
    }

    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                return normalize(parsed.filter((entry): entry is string => typeof entry === 'string'));
            }
        } catch {
            // fallback to other formats
        }
    }

    // PostgreSQL array literal format (ex: {assessment,*})
    if (raw.startsWith('{') && raw.endsWith('}')) {
        const entries = raw
            .slice(1, -1)
            .split(',')
            .map((entry) => entry.replace(/^"|"$/g, '').trim())
            .filter(Boolean);
        return normalize(entries);
    }

    return normalize(raw.split(','));
}

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
        name: userBody?.name ?? 'Usuário',
        email: userBody?.email ?? 'email@teste.com',
    };

    const organizations = Array.isArray(organizationsBody)
        ? organizationsBody
              .filter((organization) => typeof organization?.id === 'string' && typeof organization?.name === 'string')
              .map((organization) => ({
                  id: organization.id as string,
                  name: organization.name as string,
                  slug: toSlug(organization.name as string),
                  currentRole:
                      typeof organization.currentRole === 'string'
                          ? organization.currentRole
                          : typeof organization.current_role === 'string'
                            ? organization.current_role
                            : null,
                  maxCloudAccounts:
                      typeof organization.maxCloudAccounts === 'number'
                          ? organization.maxCloudAccounts
                          : typeof organization.max_cloud_accounts === 'number'
                            ? organization.max_cloud_accounts
                            : 0,
                  maxUsers:
                      typeof organization.maxUsers === 'number'
                          ? organization.maxUsers
                          : typeof organization.max_users === 'number'
                            ? organization.max_users
                            : 0,
                  plans: parseOrganizationPlans(organization.plans),
              }))
        : [];

    return {
        user,
        organizations,
    };
}

function normalizeOrganizationsPayload(payload: BackendOrganization[] | PaginatedOrganizationsPayload | null): BackendOrganization[] | null {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object' && Array.isArray(payload.items)) {
        return payload.items;
    }

    return null;
}

function fetchContext(accessToken: string) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    return Promise.all([
        backendFetch('/api/auth/me', { headers }),
        backendFetch(`/api/organization?page=1&limit=${ORGANIZATIONS_PAGE_SIZE}`, { headers }),
    ]);
}

async function fetchRemainingOrganizations(accessToken: string, startPage: number): Promise<BackendOrganization[] | null> {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    const organizations: BackendOrganization[] = [];
    let page = startPage;

    while (true) {
        const response = await backendFetch(`/api/organization?page=${page}&limit=${ORGANIZATIONS_PAGE_SIZE}`, {
            headers,
        });

        if (!response.ok) {
            return null;
        }

        const payload = await parseJsonSafe<BackendOrganization[] | PaginatedOrganizationsPayload>(response);
        const normalizedItems = normalizeOrganizationsPayload(payload);

        if (!normalizedItems) {
            return null;
        }

        organizations.push(...normalizedItems);

        if (!payload || Array.isArray(payload) || payload.pagination?.hasNextPage !== true) {
            break;
        }

        page += 1;
    }

    return organizations;
}

export async function GET() {
    const accessToken = await getAccessTokenFromCookies();
    const refreshToken = await getRefreshTokenFromCookies();

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
    }

    let currentAccessToken = accessToken;
    let rotatedTokens: AuthTokens | null = null;

    if (!currentAccessToken && refreshToken) {
        rotatedTokens = await refreshAccessToken(refreshToken);

        if (!rotatedTokens) {
            const response = NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
            clearAuthCookies(response);
            return response;
        }

        currentAccessToken = rotatedTokens.accessToken;
    }

    if (!currentAccessToken) {
        return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
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
    const initialOrganizationsPayload = await parseJsonSafe<BackendOrganization[] | PaginatedOrganizationsPayload>(organizationsResponse);
    const initialOrganizations = normalizeOrganizationsPayload(initialOrganizationsPayload);

    let organizationsBody = initialOrganizations;

    if (organizationsResponse.ok && initialOrganizations) {
        const hasNextPage = !Array.isArray(initialOrganizationsPayload) && initialOrganizationsPayload?.pagination?.hasNextPage === true;

        if (hasNextPage) {
            const nextToken = rotatedTokens?.accessToken ?? currentAccessToken;

            if (nextToken) {
                const remainingOrganizations = await fetchRemainingOrganizations(nextToken, 2);

                if (remainingOrganizations) {
                    organizationsBody = [...initialOrganizations, ...remainingOrganizations];
                }
            }
        }
    }

    if (!meResponse.ok) {
        return NextResponse.json(meBody ?? { message: 'Erro ao carregar usuário' }, { status: meResponse.status });
    }

    if (!organizationsResponse.ok) {
        return NextResponse.json(organizationsBody ?? { message: 'Erro ao carregar organizações' }, { status: organizationsResponse.status });
    }

    const response = NextResponse.json(normalizePayload(meBody, organizationsBody));

    if (rotatedTokens) {
        setAuthCookies(response, rotatedTokens);
    }

    return response;
}
