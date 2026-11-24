'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { SpCandidatesList } from '@/components/root/finops/savings/sp-candidates-list';
import {
    ACCOUNT_FILTER_ALL,
    PROVIDER_FILTER_ALL,
    parseFinopsUrlFilters,
} from '@/components/root/finops/finops-filter-utils';
import { fetchFinopsCommitmentCandidates } from '@/app/actions/finops';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import {
    candidateDisplayName,
    type CommitmentCandidate,
} from '@/lib/finops/commitment-candidates';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import { useTranslations } from '@/lib/i18n';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
} from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';

export function FinopsSpCandidatesPage() {
    const t = useTranslations('finops');
    const tCommon = useTranslations('common');
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlFilters = useMemo(() => parseFinopsUrlFilters(searchParams), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [accountsReady, setAccountsReady] = useState(false);
    const [items, setItems] = useState<CommitmentCandidate[]>([]);
    const [lookbackDays, setLookbackDays] = useState(90);
    const [loading, setLoading] = useState(true);
    const [accountFilter, setAccountFilter] = useState(ACCOUNT_FILTER_ALL);
    const [providerFilter, setProviderFilter] = useState(PROVIDER_FILTER_ALL);

    useEffect(() => {
        const syncOrg = () => {
            const stored = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
            setOrganizationId(stored || null);
        };
        syncOrg();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncOrg);
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, syncOrg);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncOrg);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, syncOrg);
        };
    }, []);

    useEffect(() => {
        if (urlFilters.accountIds[0]) setAccountFilter(urlFilters.accountIds[0]);
        if (urlFilters.providers[0]) setProviderFilter(urlFilters.providers[0]);
    }, [urlFilters.accountIds, urlFilters.providers]);

    useEffect(() => {
        let cancelled = false;
        const loadAccounts = async () => {
            if (!organizationId) {
                setCloudAccounts([]);
                setAccountsReady(true);
                return;
            }
            setAccountsReady(false);
            try {
                const response = await fetchOrganizationCloudAccounts(organizationId, {
                    midOrgId: midOrgId ?? undefined,
                });
                const body = await response.json().catch(() => null);
                if (!response.ok) {
                    if (!cancelled) toast.error(extractErrorMessage(body));
                    return;
                }
                const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
                if (!cancelled) setCloudAccounts(list as OrganizationCloudAccount[]);
            } catch {
                if (!cancelled) toast.error(tCommon.connectionError);
            } finally {
                if (!cancelled) setAccountsReady(true);
            }
        };
        void loadAccounts();
        return () => {
            cancelled = true;
        };
    }, [organizationId, midOrgId, tCommon.connectionError]);

    const scopedAccounts = useMemo(() => {
        return cloudAccounts.filter((account) => {
            if (providerFilter !== PROVIDER_FILTER_ALL && account.provider !== providerFilter) {
                return false;
            }
            return true;
        });
    }, [cloudAccounts, providerFilter]);

    const accountAliases = useMemo(() => {
        const map: Record<string, string> = {};
        for (const account of cloudAccounts) map[account.id] = account.alias;
        return map;
    }, [cloudAccounts]);

    const reload = useCallback(async () => {
        if (!organizationId || !accountsReady) return;
        setLoading(true);
        try {
            const scopedIds = scopedAccounts.map((account) => account.id);
            if (scopedIds.length === 0) {
                setItems([]);
                setLoading(false);
                return;
            }
            const response = await fetchFinopsCommitmentCandidates(organizationId, {
                cloudAccountId:
                    accountFilter !== ACCOUNT_FILTER_ALL ? accountFilter : undefined,
                cloudAccountIds:
                    accountFilter !== ACCOUNT_FILTER_ALL ? [accountFilter] : scopedIds,
                provider: providerFilter !== PROVIDER_FILTER_ALL ? providerFilter : undefined,
                lookbackDays: 90,
                limit: 50,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                setItems([]);
                return;
            }
            const nextItems = Array.isArray(body?.items) ? (body.items as CommitmentCandidate[]) : [];
            setItems(nextItems);
            setLookbackDays(
                typeof body?.lookbackDays === 'number' && Number.isFinite(body.lookbackDays)
                    ? body.lookbackDays
                    : 90,
            );
        } catch {
            toast.error(tCommon.connectionError);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [
        organizationId,
        accountsReady,
        accountFilter,
        providerFilter,
        scopedAccounts,
        tCommon.connectionError,
    ]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const savingsHref = useMemo(() => {
        const params = new URLSearchParams(searchParams.toString());
        const query = params.toString();
        return query ? `/finops/savings?${query}` : '/finops/savings';
    }, [searchParams]);

    const registerHref = (candidate: CommitmentCandidate) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('register', '1');
        params.set('resource', candidateDisplayName(candidate));
        params.set('account', candidate.cloudAccountId);
        if (candidate.estimatedSpMonthlySavings > 0) {
            params.set('amount', String(Number(candidate.estimatedSpMonthlySavings.toFixed(2))));
        } else if (candidate.estimatedMonthlyCost > 0) {
            params.set('amount', String(Number(candidate.estimatedMonthlyCost.toFixed(2))));
        }
        return `/finops/savings?${params.toString()}`;
    };

    if (!organizationId) {
        return <FinopsLoadingSkeleton />;
    }

    return (
        <div className="flex flex-col gap-6 pb-10">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                    <div className="space-y-1">
                        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 w-fit px-2">
                            <Link href={savingsHref}>
                                <ArrowLeft className="size-4" />
                                {t.potentialSavings}
                            </Link>
                        </Button>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {t.recommendSpCandidatesTitle}
                        </h1>
                        <p className="text-sm text-muted-foreground">{t.recommendSpCandidatesDesc}</p>
                        <p className="text-xs text-muted-foreground">
                            {t.recommendSpCandidatesLookback.replace('{days}', String(lookbackDays))}
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 lg:w-auto"
                    isLoading={loading}
                    onClick={() => void reload()}
                >
                    <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                    {tCommon.refresh}
                </Button>
            </div>

            <Card>
                <CardHeader className="gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                        <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <CardTitle className="text-base">{t.recommendSpCandidatesPreviewTitle}</CardTitle>
                            <CardDescription>{t.recommendSpCandidatesPreviewDesc}</CardDescription>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <SearchableSelect
                            mode="single"
                            id="sp-candidates-account"
                            label={t.fieldCloudAccount}
                            value={accountFilter}
                            onValueChange={setAccountFilter}
                            options={[
                                { value: ACCOUNT_FILTER_ALL, label: t.allAccounts },
                                ...scopedAccounts.map((account) => ({
                                    value: account.id,
                                    label: `${account.alias} (${account.provider})`,
                                })),
                            ]}
                        />
                        <SearchableSelect
                            mode="single"
                            id="sp-candidates-provider"
                            label={t.providerLabel}
                            value={providerFilter}
                            onValueChange={(value) => {
                                setProviderFilter(value);
                                setAccountFilter(ACCOUNT_FILTER_ALL);
                            }}
                            options={[
                                { value: PROVIDER_FILTER_ALL, label: t.allProviders },
                                { value: 'aws', label: 'AWS' },
                                { value: 'azure', label: 'Azure' },
                                { value: 'gcp', label: 'GCP' },
                            ]}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <SpCandidatesList
                        items={items}
                        accountAliases={accountAliases}
                        t={t}
                        isLoading={loading}
                        onUseResource={(candidate) => {
                            router.push(registerHref(candidate));
                        }}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
