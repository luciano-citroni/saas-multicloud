'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FinopsRecommendations } from '@/components/root/finops/overview/finops-recommendations';
import type { FinopsRecommendation } from '@/components/root/finops/overview/types';
import { fetchFinopsRecommendations } from '@/app/actions/finops';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

export function FinopsRecommendationsPage() {
    const router = useRouter();

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<FinopsRecommendation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const cloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        setOrganizationId(orgId);
        setCloudAccountId(cloudId);
    }, []);

    const loadRecommendations = useCallback(
        async (orgId: string, cloudId: string) => {
            setLoading(true);
            try {
                const response = await fetchFinopsRecommendations(orgId, cloudId);

                if (response.status === 401) {
                    toast.error('Sua sessão expirou.');
                    router.replace('/auth/sign-in');
                    return;
                }

                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    toast.error(extractErrorMessage(payload, 'pt'));
                    return;
                }

                const items = Array.isArray(payload)
                    ? payload
                    : Array.isArray((payload as { items?: unknown })?.items)
                      ? (payload as { items: FinopsRecommendation[] }).items
                      : [];

                setRecommendations(items);
            } catch {
                toast.error('Não foi possível carregar as recomendações.');
            } finally {
                setLoading(false);
            }
        },
        [router]
    );

    useEffect(() => {
        if (!organizationId || !cloudAccountId) {
            setLoading(false);
            return;
        }

        void loadRecommendations(organizationId, cloudAccountId);
    }, [organizationId, cloudAccountId, loadRecommendations]);

    if (!organizationId || !cloudAccountId) {
        return (
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Recomendações de Otimização</p>
                    <p className="text-xs text-muted-foreground">Selecione uma organização e conta cloud na sidebar.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl border">
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Recomendações de otimização</p>
                        <p className="text-xs text-muted-foreground">Lista completa de oportunidades de economia para esta conta</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/finops">
                            <ArrowLeft className="size-4" />
                            Voltar
                        </Link>
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="rounded-xl border p-4 text-sm text-muted-foreground">Carregando recomendações...</div>
            ) : (
                <FinopsRecommendations recommendations={recommendations} />
            )}
        </div>
    );
}
