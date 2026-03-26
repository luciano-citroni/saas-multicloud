'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { type UserOrganization, fetchUserOrganizations } from '@/app/actions/organization';
import { Button } from '@/components/ui/button';
import { extractErrorMessage } from '@/lib/error-messages';
import { OrganizationTable } from './organization-table';

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

type OrganizationsApiPayload =
    | UserOrganization[]
    | {
          items?: UserOrganization[];
      };

function normalizeOrganizations(payload: OrganizationsApiPayload | null): UserOrganization[] {
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];

    return items.filter((organization): organization is UserOrganization => {
        return typeof organization?.id === 'string' && typeof organization?.name === 'string';
    });
}

export function OrganizationOverview() {
    const router = useRouter();
    const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadOrganizations = useCallback(
        async (options?: { silent?: boolean; nextRefreshing?: boolean }) => {
            const silent = options?.silent ?? false;
            const nextRefreshing = options?.nextRefreshing ?? false;

            if (nextRefreshing) {
                setRefreshing(true);
            } else if (!silent) {
                setLoading(true);
            }

            try {
                const response = await fetchUserOrganizations();
                const payload = (await response.json().catch(() => null)) as OrganizationsApiPayload | ApiErrorPayload | null;

                if (response.status === 401) {
                    toast.error('Sua sessão expirou. Faça login novamente.');
                    router.replace('/auth/sign-in');
                    router.refresh();
                    return;
                }

                if (!response.ok) {
                    if (!silent) {
                        toast.error(extractErrorMessage(payload, 'pt'));
                    }
                    setOrganizations([]);
                    return;
                }

                setOrganizations(normalizeOrganizations(payload as OrganizationsApiPayload | null));
            } catch {
                if (!silent) {
                    toast.error('Não foi possível carregar as organizações.');
                }
                setOrganizations([]);
            } finally {
                if (nextRefreshing) {
                    setRefreshing(false);
                } else if (!silent) {
                    setLoading(false);
                }
            }
        },
        [router]
    );

    useEffect(() => {
        void loadOrganizations();
    }, [loadOrganizations]);

    const handleEditOrganization = (organizationId: string) => {
        router.push(`/organizations/${organizationId}/edit`);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            <Building2 className="size-4.5" />
                            Organizações acessíveis
                        </p>
                        <p className="max-w-2xl text-xs text-muted-foreground sm:text-sm">
                            Visualize todas as organizações em que você participa e edite apenas aquelas em que seu papel é owner.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Link href="/organizations/new">
                            <Button size="sm">
                                <Plus className="mr-1 h-4 w-4" />
                                Nova organização
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadOrganizations({ nextRefreshing: true })}
                            disabled={loading || refreshing}
                        >
                            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
                            Atualizar
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">Carregando organizações...</div>
                ) : organizations.length === 0 ? (
                    <div className="px-4 py-6">
                        <p className="text-sm text-muted-foreground">Nenhuma organização encontrada para este usuário.</p>
                    </div>
                ) : (
                    <div className="p-4">
                        <OrganizationTable data={organizations} onEditOrganization={handleEditOrganization} />
                    </div>
                )}
            </div>
        </div>
    );
}
