'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchOrganizationCloudAccountById } from '@/app/actions/organization';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { GcpInventoryPage } from '@/components/root/cloud-accounts/inventory/gcp-inventory-page';
import { AlertCircle } from 'lucide-react';

type CloudAccountDetails = {
    id: string;
    alias: string;
    provider: string;
    isActive?: boolean;
};

export default function CloudAccountInventoryPage() {
    const params = useParams<{ cloudAccountId: string }>();
    const cloudAccountId = params?.cloudAccountId;
    const router = useRouter();

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [account, setAccount] = useState<CloudAccountDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

        const resolveOrg = async () => {
            if (stored) {
                try {
                    const parsed = JSON.parse(stored) as { id?: string };
                    if (parsed?.id) setOrganizationId(parsed.id);
                } catch {
                    // ignore
                }
            }
        };

        void resolveOrg();
    }, []);

    useEffect(() => {
        if (!organizationId || !cloudAccountId) return;

        const loadAccount = async () => {
            setLoading(true);

            try {
                const response = await fetchOrganizationCloudAccountById(organizationId, cloudAccountId);
                const body = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    const message = extractErrorMessage(body, 'pt');
                    setError(message);
                    toast.error(message);
                    return;
                }

                const data = body as CloudAccountDetails;
                setAccount(data);
            } catch {
                const message = 'Erro ao carregar conta cloud';
                setError(message);
                toast.error(message);
            } finally {
                setLoading(false);
            }
        };

        void loadAccount();
    }, [organizationId, cloudAccountId]);

    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full" />
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !account) {
        return (
            <div className="p-6">
                <Card>
                    <CardContent className="flex items-center gap-3 py-8 text-destructive">
                        <AlertCircle className="size-5" />
                        <span>{error ?? 'Conta cloud não encontrada.'}</span>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const provider = account.provider.toLowerCase();

    if (provider !== 'gcp') {
        router.replace(`/cloud-accounts/${cloudAccountId}/edit`);
        return null;
    }

    return (
        <div className="p-6">
            <GcpInventoryPage cloudAccountId={cloudAccountId} accountAlias={account.alias} />
        </div>
    );
}
