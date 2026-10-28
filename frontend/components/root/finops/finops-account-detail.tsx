'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FinopsLoadingSkeleton } from '@/components/root/finops/overview/finops-loading-skeleton';
import { FinopsConsentDialog } from '@/components/root/finops/overview/finops-consent-dialog';
import { FinopsSyncDialog } from '@/components/root/finops/overview/finops-sync-dialog';
import { FinopsSpendPanel } from '@/components/root/finops/overview/finops-spend-panel';
import { FinopsOptimizePanel } from '@/components/root/finops/overview/finops-optimize-panel';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import { FinopsKpiStrip, type FinopsBudgetStatusItem } from '@/components/root/finops/finops-kpi-strip';
import { DASHBOARD_PERIODS, periodLabel, type FinopsTab, isDashboardPeriod } from '@/components/root/finops/finops-filter-utils';
import { formatDate } from '@/components/root/finops/overview/helpers';
import type {
    DashboardPeriod,
    FinopsJob,
    OrgFinopsOptimize,
    OrgFinopsOverview,
    SidebarContextPayload,
    SyncRun,
} from '@/components/root/finops/overview/types';
import {
    ACTIVE_ORG_STORAGE_KEY,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    notifyActiveCloudAccountChanged,
} from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasRequiredOrganizationRole, normalizeOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import {
    acceptFinopsConsent,
    fetchFinopsBudgetStatuses,
    fetchFinopsConsent,
    fetchFinopsJobStatus,
    fetchFinopsOrgOptimize,
    fetchFinopsOrgOverview,
    fetchFinopsSyncRuns,
    revokeFinopsConsent,
    startFinopsSync,
} from '@/app/actions/finops';
import { fetchOrganizationCloudAccountById, type OrganizationCloudAccount } from '@/app/actions/organization';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const CLOUD_PROVIDER_STORAGE_KEY = 'smc_active_cloud_provider';

type FinopsAccountDetailProps = {
    cloudAccountId: string;
};

export function FinopsAccountDetail({ cloudAccountId }: FinopsAccountDetailProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tf = useTranslations('finops');
    const tc = useTranslations('common');

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [account, setAccount] = useState<OrganizationCloudAccount | null>(null);
    const [currentRole, setCurrentRole] = useState<OrganizationRole | null>(null);
    const [hasConsent, setHasConsent] = useState<boolean | null>(null);

    const [period, setPeriod] = useState<DashboardPeriod>('lastmonth');
    const [tab, setTab] = useState<FinopsTab>('spend');

    const [overview, setOverview] = useState<OrgFinopsOverview | null>(null);
    const [optimize, setOptimize] = useState<OrgFinopsOptimize | null>(null);
    const [budgetStatuses, setBudgetStatuses] = useState<FinopsBudgetStatusItem[]>([]);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [acceptingConsent, setAcceptingConsent] = useState(false);
    const [collectingCosts, setCollectingCosts] = useState(false);

    const [showConsentDialog, setShowConsentDialog] = useState(false);
    const [showSyncDialog, setShowSyncDialog] = useState(false);
    const [showRevokeDialog, setShowRevokeDialog] = useState(false);
    const [revokingConsent, setRevokingConsent] = useState(false);

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const periodParam = searchParams.get('period');
        const tabParam = searchParams.get('tab');
        if (isDashboardPeriod(periodParam)) setPeriod(periodParam);
        if (tabParam === 'optimize' || tabParam === 'spend') setTab(tabParam);

        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        window.localStorage.setItem(ACTIVE_CLOUD_GLOBAL_KEY, cloudAccountId);
        notifyActiveCloudAccountChanged();
    }, [cloudAccountId, searchParams]);

    useEffect(() => {
        const handleOrgChange = () => setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handleOrgChange);
        window.addEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleOrgChange);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleOrgChange);
            window.removeEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleOrgChange);
        };
    }, []);

    useEffect(() => {
        if (!organizationId) return;

        const loadAccount = async () => {
            try {
                const response = await fetchOrganizationCloudAccountById(organizationId, cloudAccountId);
                if (!response.ok) {
                    setAccount(null);
                    return;
                }
                const payload = (await response.json().catch(() => null)) as OrganizationCloudAccount | null;
                setAccount(payload);
                if (payload?.provider) {
                    window.localStorage.setItem(CLOUD_PROVIDER_STORAGE_KEY, payload.provider);
                }
            } catch {
                setAccount(null);
            }
        };

        void loadAccount();
    }, [cloudAccountId, organizationId]);

    useEffect(() => {
        if (!organizationId) return;

        const loadRole = async () => {
            try {
                const response = await fetch('/api/sidebar/context', { cache: 'no-store' });
                if (!response.ok) return;
                const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
                const org = payload?.organizations?.find((o) => o?.id === organizationId);
                setCurrentRole(normalizeOrganizationRole(org?.currentRole ?? null));
            } catch {
                // non-blocking
            }
        };

        void loadRole();
    }, [organizationId]);

    const loadConsent = useCallback(async (orgId: string, cloudId: string, provider: string) => {
        const response = await fetchFinopsConsent(orgId, cloudId, provider);
        if (response.status === 401) {
            toast.error(tc.sessionExpired);
            router.replace('/auth/sign-in');
            return false;
        }
        if (!response.ok) {
            setHasConsent(false);
            return false;
        }
        const payload = await response.json().catch(() => null);
        const accepted = payload?.accepted === true;
        setHasConsent(accepted);
        return accepted;
    }, [router, tc.sessionExpired]);

    const loadOverview = useCallback(
        async (orgId: string, options: { silent?: boolean } = {}) => {
            if (!options.silent) setLoadingInitial(true);
            try {
                const response = await fetchFinopsOrgOverview(orgId, {
                    period,
                    cloudAccountId,
                });
                if (response.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }
                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    toast.error(extractErrorMessage(payload));
                    setOverview(null);
                    return;
                }
                setOverview((await response.json().catch(() => null)) as OrgFinopsOverview | null);
            } catch {
                if (!options.silent) toast.error(tf.loadError);
            } finally {
                if (!options.silent) setLoadingInitial(false);
            }
        },
        [cloudAccountId, period, router, tc.sessionExpired, tf.loadError]
    );

    const loadOptimize = useCallback(
        async (orgId: string) => {
            try {
                const response = await fetchFinopsOrgOptimize(orgId, {
                    status: 'open',
                    days: overview?.period.anomalyDays ?? 90,
                    cloudAccountId,
                    limit: 50,
                });
                if (!response.ok) {
                    setOptimize(null);
                    return;
                }
                setOptimize((await response.json().catch(() => null)) as OrgFinopsOptimize | null);
            } catch {
                setOptimize(null);
            }
        },
        [cloudAccountId, overview?.period.anomalyDays]
    );

    useEffect(() => {
        if (!organizationId || !account) {
            if (!organizationId) setLoadingInitial(false);
            return;
        }

        const bootstrap = async () => {
            const accepted = await loadConsent(organizationId, account.id, account.provider);
            if (accepted) {
                await loadOverview(organizationId);
            } else {
                setOverview(null);
                setLoadingInitial(false);
                if (hasRequiredOrganizationRole(currentRole, 'ADMIN')) {
                    setShowConsentDialog(true);
                }
            }
        };

        void bootstrap();
    }, [account, currentRole, loadConsent, loadOverview, organizationId]);

    useEffect(() => {
        if (!organizationId || tab !== 'optimize' || hasConsent !== true) return;
        void loadOptimize(organizationId);
    }, [hasConsent, loadOptimize, organizationId, tab]);

    useEffect(() => {
        if (!organizationId || !cloudAccountId || hasConsent !== true) {
            setBudgetStatuses([]);
            setLastSyncAt(null);
            return;
        }

        const loadExtras = async () => {
            try {
                const [budgetRes, syncRes] = await Promise.all([
                    fetchFinopsBudgetStatuses(organizationId, cloudAccountId),
                    fetchFinopsSyncRuns(organizationId, cloudAccountId),
                ]);

                if (budgetRes.ok) {
                    const payload = (await budgetRes.json().catch(() => null)) as FinopsBudgetStatusItem[] | null;
                    setBudgetStatuses(Array.isArray(payload) ? payload : []);
                } else {
                    setBudgetStatuses([]);
                }

                if (syncRes.ok) {
                    const payload = await syncRes.json().catch(() => null);
                    const runs = Array.isArray(payload)
                        ? (payload as SyncRun[])
                        : Array.isArray((payload as { items?: SyncRun[] })?.items)
                          ? (payload as { items: SyncRun[] }).items
                          : [];
                    const completed = runs.find((run) => run.status === 'completed' || run.completedAt);
                    setLastSyncAt(completed?.completedAt ?? completed?.createdAt ?? null);
                } else {
                    setLastSyncAt(null);
                }
            } catch {
                setBudgetStatuses([]);
                setLastSyncAt(null);
            }
        };

        void loadExtras();
    }, [cloudAccountId, hasConsent, organizationId]);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    useEffect(() => () => stopPolling(), [stopPolling]);

    const pollJobStatus = useCallback(
        async (orgId: string, cloudId: string, jobId: string) => {
            try {
                const response = await fetchFinopsJobStatus(orgId, cloudId, jobId);
                if (!response.ok) return;
                const job = (await response.json().catch(() => null)) as FinopsJob | null;
                if (!job) return;

                if (job.status === 'completed' || job.status === 'failed') {
                    stopPolling();
                    setSyncing(false);
                    setCollectingCosts(false);
                    if (job.status === 'completed') {
                        toast.success(tf.syncComplete);
                        void loadOverview(orgId, { silent: true });
                        if (tab === 'optimize') void loadOptimize(orgId);
                    } else {
                        toast.error(job.error?.trim() ? job.error : tf.syncFailed);
                    }
                }
            } catch {
                // ignore
            }
        },
        [loadOptimize, loadOverview, stopPolling, tab, tf.syncComplete, tf.syncFailed]
    );

    const handleStartSync = async (granularity: 'daily' | 'monthly', startDate: string, endDate: string) => {
        if (!organizationId || !account) return;

        setSyncing(true);
        setCollectingCosts(true);
        setShowSyncDialog(false);

        try {
            const response = await startFinopsSync(organizationId, account.id, account.provider, granularity, startDate, endDate);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                setSyncing(false);
                setCollectingCosts(false);
                return;
            }

            const jobId = (payload as { jobId?: string })?.jobId;
            if (!jobId) {
                setSyncing(false);
                setCollectingCosts(false);
                return;
            }

            toast.success(tf.syncStarted);
            stopPolling();
            pollingRef.current = setInterval(() => {
                void pollJobStatus(organizationId, account.id, jobId);
            }, 3000);
        } catch {
            toast.error(tf.syncError);
            setSyncing(false);
            setCollectingCosts(false);
        }
    };

    const handleAcceptConsent = async () => {
        if (!organizationId || !account) return;
        setAcceptingConsent(true);
        try {
            const response = await acceptFinopsConsent(organizationId, account.id, account.provider);
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }
            setShowConsentDialog(false);
            setHasConsent(true);
            toast.success(tf.consentSuccess);

            const end = new Date();
            const start = new Date(end);
            start.setMonth(start.getMonth() - 3);
            void handleStartSync('daily', start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
            void loadOverview(organizationId, { silent: true });
        } catch {
            toast.error(tf.consentError);
        } finally {
            setAcceptingConsent(false);
        }
    };

    const handleRevokeConsent = async () => {
        if (!organizationId || !account) return;
        setRevokingConsent(true);
        try {
            const response = await revokeFinopsConsent(organizationId, account.id, account.provider);
            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                toast.error(extractErrorMessage(payload, 'pt'));
                return;
            }
            setShowRevokeDialog(false);
            setHasConsent(false);
            toast.success(tf.consentRevokeSuccess);
            void loadOverview(organizationId, { silent: true });
        } catch {
            toast.error(tf.consentRevokeError);
        } finally {
            setRevokingConsent(false);
        }
    };

    const canSync = hasRequiredOrganizationRole(currentRole, 'ADMIN');

    if (!organizationId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{tf.selectOrgTitle}</CardTitle>
                    <CardDescription>{tf.selectOrgDesc}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loadingInitial && !overview && hasConsent !== false) {
        return <FinopsLoadingSkeleton />;
    }

    if (!account) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Conta não encontrada</CardTitle>
                    <CardDescription>
                        <Link href="/finops" className="underline">
                            Voltar ao FinOps
                        </Link>
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const backHref = (() => {
        const params = new URLSearchParams();
        if (period !== 'lastmonth') params.set('period', period);
        if (tab !== 'spend') params.set('tab', tab);
        params.set('account', cloudAccountId);
        const q = params.toString();
        return q ? `/finops?${q}` : '/finops';
    })();

    return (
        <>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Link
                                href={backHref}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="size-3" />
                                Visão geral
                            </Link>
                            <h1 className="text-xl font-semibold tracking-tight">{account.alias}</h1>
                            <p className="text-sm uppercase text-muted-foreground">{account.provider}</p>
                        </div>
                        <FinopsSubnav />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={period}
                            onValueChange={(value) => {
                                const next = value as DashboardPeriod;
                                setPeriod(next);
                                const params = new URLSearchParams(searchParams.toString());
                                if (next === 'lastmonth') params.delete('period');
                                else params.set('period', next);
                                const q = params.toString();
                                router.replace(q ? `/finops/accounts/${cloudAccountId}?${q}` : `/finops/accounts/${cloudAccountId}`, {
                                    scroll: false,
                                });
                            }}
                        >
                            <SelectTrigger className="w-[170px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DASHBOARD_PERIODS.map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {periodLabel(item)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                if (!organizationId) return;
                                setRefreshing(true);
                                void loadOverview(organizationId, { silent: true }).finally(() => setRefreshing(false));
                                if (tab === 'optimize') void loadOptimize(organizationId);
                            }}
                            disabled={refreshing || hasConsent !== true}
                        >
                            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
                            Atualizar
                        </Button>

                        {canSync && (
                            <Button
                                size="sm"
                                onClick={() => {
                                    if (hasConsent !== true) {
                                        setShowConsentDialog(true);
                                        return;
                                    }
                                    setShowSyncDialog(true);
                                }}
                                isLoading={syncing}
                                disabled={syncing || revokingConsent}
                            >
                                <PlayCircle className="size-4" />
                                {hasConsent ? 'Sincronizar' : 'Aceitar termos'}
                            </Button>
                        )}

                        {canSync && hasConsent === true && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setShowRevokeDialog(true)}
                                disabled={revokingConsent || syncing}
                            >
                                {tf.consentRevokeLabel}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {overview?.period && (
                        <span>
                            Período analisado:{' '}
                            <strong className="text-foreground">
                                {overview.period.startDate} → {overview.period.endDate}
                            </strong>
                        </span>
                    )}
                    <span>
                        Última sincronização: <strong className="text-foreground">{formatDate(lastSyncAt)}</strong>
                    </span>
                </div>

                {collectingCosts && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                        <Loader2 className="size-4 animate-spin" />
                        {tf.collectingCosts}
                    </div>
                )}

                {hasConsent === false && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{tf.emptyCostsTitle}</CardTitle>
                            <CardDescription>{tf.emptyCostsDesc}</CardDescription>
                        </CardHeader>
                    </Card>
                )}

                {hasConsent === true && (
                    <>
                        {budgetStatuses.some((item) => (item.triggeredAlerts?.length ?? 0) > 0) && (
                            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                                Um ou mais orçamentos desta conta atingiram limiares de alerta.{' '}
                                <Link
                                    href={`/finops/budgets?account=${encodeURIComponent(cloudAccountId)}`}
                                    className="font-medium underline underline-offset-2"
                                >
                                    Ver orçamentos
                                </Link>
                            </div>
                        )}

                        <FinopsKpiStrip
                            cost={overview?.totals.cost ?? 0}
                            currency={overview?.totals.currency ?? 'USD'}
                            momGrowth={Number(overview?.totals.momGrowth ?? 0)}
                            forecastedCost={overview?.totals.forecastedCost ?? null}
                            potentialSavings={overview?.totals.potentialSavings ?? 0}
                            openAnomalies={optimize?.totals.openAnomalies ?? overview?.anomalies.length ?? 0}
                            openRecommendations={
                                optimize?.totals.openRecommendations ?? overview?.recommendations.length ?? 0
                            }
                            budgetStatuses={budgetStatuses}
                            singleAccountMode
                            budgetsHref={`/finops/budgets?account=${encodeURIComponent(cloudAccountId)}`}
                            isLoading={loadingInitial && !overview}
                        />

                        <Tabs
                            value={tab}
                            onValueChange={(value) => {
                                const next = value as FinopsTab;
                                setTab(next);
                                const params = new URLSearchParams(searchParams.toString());
                                if (next === 'spend') params.delete('tab');
                                else params.set('tab', next);
                                const q = params.toString();
                                router.replace(q ? `/finops/accounts/${cloudAccountId}?${q}` : `/finops/accounts/${cloudAccountId}`, {
                                    scroll: false,
                                });
                            }}
                        >
                            <TabsList>
                                <TabsTrigger value="spend">Gastos</TabsTrigger>
                                <TabsTrigger value="optimize">Otimizar</TabsTrigger>
                            </TabsList>
                            <TabsContent value="spend" className="mt-4">
                                <FinopsSpendPanel
                                    overview={overview}
                                    accounts={overview?.accounts ?? []}
                                    costByService={overview?.costByService ?? []}
                                    isLoading={loadingInitial && !overview}
                                />
                            </TabsContent>
                            <TabsContent value="optimize" className="mt-4">
                                <FinopsOptimizePanel
                                    organizationId={organizationId}
                                    items={optimize?.items ?? []}
                                    accountAliases={{ [account.id]: account.alias }}
                                    isLoading={!optimize && tab === 'optimize'}
                                    onChanged={() => void loadOptimize(organizationId)}
                                />
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </div>

            <FinopsConsentDialog
                open={showConsentDialog}
                cloudProvider={account.provider}
                onAccept={() => void handleAcceptConsent()}
                onCancel={() => setShowConsentDialog(false)}
                isLoading={acceptingConsent}
            />

            <FinopsSyncDialog
                open={showSyncDialog}
                cloudProvider={account.provider}
                onConfirm={(granularity, startDate, endDate) => void handleStartSync(granularity, startDate, endDate)}
                onCancel={() => setShowSyncDialog(false)}
                isLoading={syncing}
            />

            <AlertDialog open={showRevokeDialog} onOpenChange={(open) => !revokingConsent && setShowRevokeDialog(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{tf.consentRevokeTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{tf.consentRevokeDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revokingConsent}>{tc.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={revokingConsent}
                            onClick={(event) => {
                                event.preventDefault();
                                void handleRevokeConsent();
                            }}
                        >
                            {revokingConsent ? <Loader2 className="size-4 animate-spin" /> : null}
                            {tf.consentRevokeConfirm}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
