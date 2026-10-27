'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    PiggyBank,
    ShieldCheck,
    Target,
    TrendingDown,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import { fetchSubscription } from '@/app/actions/billing';
import { fetchFinopsBudgetStatuses, fetchFinopsOrgOverview } from '@/app/actions/finops';
import { fetchGovernanceScore } from '@/app/actions/governance';
import { fetchOrganizationCloudAccounts } from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/components/providers/locale-provider';
import {
    type BudgetRisk,
    type DashboardAccount,
    type DashboardOrg,
    type DashboardSubscription,
    type FinopsSnapshot,
    type GovernanceAccount,
    isFinopsProvider,
    parseAccounts,
    parseBudgets,
    parseOrg,
    parseOverview,
    parseScore,
    parseSubscription,
    providerLabel,
    readCount,
} from '@/components/root/dashboard/model';
import { useTranslations } from '@/lib/i18n';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import { ACTIVE_ORG_CHANGED_EVENT, ACTIVE_ORG_STORAGE_KEY, SIDEBAR_CONTEXT_UPDATED_EVENT } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';

const VISIBLE_DECISIONS = 6;
const VISIBLE_ACCOUNTS = 6;
const BUDGET_ACCOUNT_CAP = 8;
const SCORE_CONCURRENCY = 4;

type DecisionTone = 'action' | 'watch' | 'opportunity';

type DecisionItem = {
    id: string;
    tone: DecisionTone;
    text: string;
    href: string;
};

type DashboardModel = {
    org: DashboardOrg;
    subscription: DashboardSubscription | null;
    planUnavailable: boolean;
    cloudTotal: number;
    orgTotal: number | null;
    userTotal: number | null;
    accounts: DashboardAccount[];
    governance: GovernanceAccount[];
    governanceFailed: boolean;
    finops: FinopsSnapshot | null;
    finopsLocked: boolean;
    finopsFailed: boolean;
    budgets: BudgetRisk[];
    updatedAt: Date;
};

type HomeCopy = ReturnType<typeof useTranslations<'home'>>;

function fill(template: string, values: Record<string, string | number>) {
    return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    async function run() {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(items[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
    return results;
}

function pressure(used: number, limit: number | null): 'ok' | 'near' | 'full' {
    if (limit == null || limit <= 0) return 'ok';
    if (used >= limit) return 'full';
    if (used / limit >= 0.8) return 'near';
    return 'ok';
}

function scoreTone(score: number): 'good' | 'fair' | 'low' {
    if (score >= 80) return 'good';
    if (score >= 50) return 'fair';
    return 'low';
}

export function DecisionDashboard() {
    const router = useRouter();
    const t = useTranslations('home');
    const { locale } = useLocale();
    const [model, setModel] = useState<DashboardModel | null>(null);
    const [phase, setPhase] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
    const [refreshing, setRefreshing] = useState(false);
    const requestId = useRef(0);
    const modelRef = useRef<DashboardModel | null>(null);
    modelRef.current = model;

    const load = useCallback(async () => {
        const request = ++requestId.current;
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const keepVisible = modelRef.current?.org.id === organizationId;

        if (!organizationId) {
            if (request !== requestId.current) return;
            setModel(null);
            setPhase('empty');
            setRefreshing(false);
            return;
        }

        if (keepVisible) {
            setRefreshing(true);
        } else {
            setModel(null);
            setPhase('loading');
        }

        try {
            const [sidebarResponse, subscriptionResponse, accountsResponse, orgsResponse, membersResponse] = await Promise.all([
                fetch('/api/sidebar/context', { cache: 'no-store' }),
                fetchSubscription(organizationId),
                fetchOrganizationCloudAccounts(organizationId, { page: 1, limit: 100 }),
                fetch(`/api/orgs?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' }),
                fetch(`/api/organization/${encodeURIComponent(organizationId)}/members`, { cache: 'no-store' }),
            ]);

            if (request !== requestId.current) return;

            if ([sidebarResponse, subscriptionResponse, accountsResponse].some((response) => response.status === 401)) {
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (!sidebarResponse.ok || !accountsResponse.ok) {
                setPhase('error');
                toast.error(t.loadError);
                return;
            }

            const org = parseOrg(await sidebarResponse.json(), organizationId);
            if (!org) {
                setPhase('error');
                toast.error(t.loadError);
                return;
            }

            const subscription = subscriptionResponse.ok ? parseSubscription(await subscriptionResponse.json()) : null;
            const planUnavailable = !subscriptionResponse.ok && subscriptionResponse.status !== 404;
            const accountPayload = await accountsResponse.json();
            const { accounts, total: cloudTotal } = parseAccounts(accountPayload);
            const orgTotal = orgsResponse.ok ? readCount(await orgsResponse.json()) : null;
            const userTotal = membersResponse.ok ? readCount(await membersResponse.json()) : null;
            const modules = normalizePlanModules(subscription?.modules.length ? subscription.modules : org.plans);
            const finopsEnabled = hasModuleAccess(modules, PlanModule.FINOPS);
            const governanceEnabled = hasModuleAccess(modules, PlanModule.GOVERNANCE);
            const budgetTargets = accounts.filter((account) => isFinopsProvider(account.provider)).slice(0, BUDGET_ACCOUNT_CAP);

            const [finopsResult, governanceResult, budgetGroups] = await Promise.all([
                finopsEnabled
                    ? loadFinops(organizationId)
                    : Promise.resolve({ snapshot: null, locked: false, failed: false, unauthorized: false }),
                governanceEnabled
                    ? loadGovernance(organizationId, accounts)
                    : Promise.resolve({ rows: [], failed: false, unauthorized: false }),
                finopsEnabled
                    ? mapPool(budgetTargets, SCORE_CONCURRENCY, async (account) => {
                          try {
                              const response = await fetchFinopsBudgetStatuses(organizationId, account.id);
                              if (response.status === 401) return { unauthorized: true as const, items: [] as BudgetRisk[] };
                              if (!response.ok) return { unauthorized: false as const, items: [] as BudgetRisk[] };
                              return {
                                  unauthorized: false as const,
                                  items: parseBudgets(await response.json(), account.alias),
                              };
                          } catch {
                              return { unauthorized: false as const, items: [] as BudgetRisk[] };
                          }
                      })
                    : Promise.resolve([]),
            ]);

            if (request !== requestId.current) return;

            if (finopsResult.unauthorized || governanceResult.unauthorized || budgetGroups.some((group) => group.unauthorized)) {
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            const budgets = budgetGroups
                .flatMap((group) => group.items)
                .sort((left, right) => right.usagePercentage - left.usagePercentage);

            setModel({
                org,
                subscription,
                planUnavailable,
                cloudTotal,
                orgTotal,
                userTotal,
                accounts,
                governance: governanceResult.rows,
                governanceFailed: governanceResult.failed,
                finops: finopsResult.snapshot,
                finopsLocked: !finopsEnabled || finopsResult.locked,
                finopsFailed: finopsResult.failed,
                budgets,
                updatedAt: new Date(),
            });
            setPhase('ready');
        } catch {
            if (request !== requestId.current) return;
            setPhase((current) => (current === 'ready' ? current : 'error'));
            toast.error(t.loadError);
        } finally {
            if (request === requestId.current) {
                setRefreshing(false);
            }
        }
    }, [router, t]);

    useEffect(() => {
        void load();

        const onContext = () => {
            void load();
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key && event.key !== ACTIVE_ORG_STORAGE_KEY) return;
            void load();
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, onContext);
        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, onContext);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, onContext);
            window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, onContext);
            window.removeEventListener('storage', onStorage);
        };
    }, [load]);

    const dateLocale = locale === 'en' ? 'en-US' : 'pt-BR';
    const decisions = useMemo(() => (model ? buildDecisions(model, t, dateLocale) : []), [dateLocale, model, t]);
    const visibleDecisions = decisions.slice(0, VISIBLE_DECISIONS);

    return (
        <div className="flex w-full flex-col gap-4">
            {phase === 'loading' && !model ? <DashboardSkeleton /> : null}
            {phase === 'empty' ? <EmptyTenant t={t} /> : null}
            {phase === 'error' && !model ? <ErrorState message={t.loadError} /> : null}
            {model ? (
                <div className="flex flex-col gap-4">
                    <KpiStrip t={t} model={model} dateLocale={dateLocale} />
                    <DecisionQueue
                        t={t}
                        decisions={visibleDecisions}
                        hiddenCount={Math.max(0, decisions.length - visibleDecisions.length)}
                    />
                    <div className="grid gap-4 lg:grid-cols-5">
                        <FinopsPanel className="lg:col-span-3" t={t} model={model} dateLocale={dateLocale} />
                        <GovernancePanel className="lg:col-span-2" t={t} model={model} dateLocale={dateLocale} />
                    </div>
                    <PlanPanel t={t} model={model} dateLocale={dateLocale} />
                </div>
            ) : null}
        </div>
    );
}

async function loadFinops(
    organizationId: string
): Promise<{ snapshot: FinopsSnapshot | null; locked: boolean; failed: boolean; unauthorized: boolean }> {
    try {
        const response = await fetchFinopsOrgOverview(organizationId, { period: 'currentmonth', anomalyDays: 30 });
        if (response.status === 401) {
            return { snapshot: null, locked: false, failed: false, unauthorized: true };
        }
        if (response.status === 403) {
            return { snapshot: null, locked: true, failed: false, unauthorized: false };
        }
        if (!response.ok) {
            return { snapshot: null, locked: false, failed: true, unauthorized: false };
        }

        return { snapshot: parseOverview(await response.json()), locked: false, failed: false, unauthorized: false };
    } catch {
        return { snapshot: null, locked: false, failed: true, unauthorized: false };
    }
}

async function loadGovernance(
    organizationId: string,
    accounts: DashboardAccount[]
): Promise<{ rows: GovernanceAccount[]; failed: boolean; unauthorized: boolean }> {
    if (accounts.length === 0) {
        return { rows: [], failed: false, unauthorized: false };
    }

    let failures = 0;
    let unauthorized = false;
    const rows = await mapPool(accounts, SCORE_CONCURRENCY, async (account) => {
        try {
            const response = await fetchGovernanceScore(organizationId, account.id);
            if (response.status === 401) {
                unauthorized = true;
                return { ...account, score: null };
            }
            if (response.status === 404) {
                return { ...account, score: null };
            }
            if (!response.ok) {
                failures += 1;
                return { ...account, score: null };
            }

            return { ...account, score: parseScore(await response.json()) };
        } catch {
            failures += 1;
            return { ...account, score: null };
        }
    });

    return { rows, failed: failures === accounts.length, unauthorized };
}

function buildDecisions(model: DashboardModel, t: HomeCopy, dateLocale: string): DecisionItem[] {
    const items: DecisionItem[] = [];
    const modules = normalizePlanModules(model.subscription?.modules.length ? model.subscription.modules : model.org.plans);
    const governanceEnabled = hasModuleAccess(modules, PlanModule.GOVERNANCE) && !model.governanceFailed;
    const finopsEnabled = hasModuleAccess(modules, PlanModule.FINOPS) && !model.finopsLocked && !model.finopsFailed;
    const cloudLimit = model.subscription?.maxCloudAccounts ?? positiveFromOrg(model.org.maxCloudAccounts);
    const userLimit = model.subscription?.maxUsers ?? positiveFromOrg(model.org.maxUsers);
    const orgLimit = model.subscription?.maxOrgAccounts ?? null;

    if (model.planUnavailable) {
        items.push({ id: 'plan-unavailable', tone: 'watch', text: t.planLoadError, href: '/billing' });
    } else if (!model.subscription) {
        items.push({ id: 'plan-missing', tone: 'action', text: t.planMissing, href: '/billing' });
    } else if (model.subscription.status !== 'active' && model.subscription.status !== 'trialing') {
        items.push({
            id: 'plan-inactive',
            tone: 'action',
            text: fill(t.planInactive, { status: statusLabel(model.subscription.status, t).toLowerCase() }),
            href: '/billing',
        });
    } else if (model.subscription.cancelAtPeriodEnd && model.subscription.currentPeriodEnd) {
        items.push({
            id: 'plan-canceling',
            tone: 'watch',
            text: fill(t.planCanceling, { date: formatDate(model.subscription.currentPeriodEnd, dateLocale) }),
            href: '/billing',
        });
    }

    pushLimit(items, 'cloud', pressure(model.cloudTotal, cloudLimit), t.cloudLimit, t.cloudNear, model.cloudTotal, cloudLimit, '/billing');
    if (model.userTotal != null) {
        pushLimit(items, 'users', pressure(model.userTotal, userLimit), t.userLimit, t.userNear, model.userTotal, userLimit, '/tenant/users');
    }
    if (model.orgTotal != null) {
        pushLimit(items, 'orgs', pressure(model.orgTotal, orgLimit), t.orgLimit, t.orgNear, model.orgTotal, orgLimit, '/tenant/organizations');
    }

    if (model.accounts.length === 0) {
        items.push({ id: 'no-accounts', tone: 'action', text: t.noAccounts, href: '/cloud-accounts/new' });
    }

    const syncFailures = model.accounts.filter((account) => account.syncError).length;
    if (syncFailures > 0) {
        items.push({ id: 'sync-failed', tone: 'watch', text: fill(t.syncFailed, { count: syncFailures }), href: '/cloud-accounts' });
    }

    if (governanceEnabled && model.accounts.length > 0) {
        const scanned = model.governance.filter((account) => account.score);
        const critical = scanned.reduce((sum, account) => sum + (account.score?.criticalFindings ?? 0), 0);
        const high = scanned.reduce((sum, account) => sum + (account.score?.highFindings ?? 0), 0);
        const worst = [...scanned].sort((left, right) => (left.score?.score ?? 100) - (right.score?.score ?? 100))[0];
        const unscanned = model.governance.filter((account) => !account.score).length;

        if (critical > 0 && worst?.score) {
            items.push({
                id: 'gov-critical',
                tone: 'action',
                text: fill(t.govCritical, { count: critical, score: Math.round(worst.score.score), account: worst.alias }),
                href: '/governance',
            });
        }
        if (high > 0) {
            items.push({ id: 'gov-high', tone: 'watch', text: fill(t.govHigh, { count: high }), href: '/governance' });
        }
        if (unscanned > 0) {
            items.push({ id: 'gov-unscanned', tone: 'watch', text: fill(t.govUnscanned, { count: unscanned }), href: '/governance' });
        }
    }

    if (finopsEnabled) {
        const supported = model.accounts.filter((account) => isFinopsProvider(account.provider)).length;
        if (supported > 0 && model.finops && model.finops.consentedAccounts === 0) {
            items.push({ id: 'finops-consent', tone: 'action', text: t.finopsNoConsent, href: '/finops' });
        }

        if (model.finops?.state === 'ready') {
            if (model.finops.hotAnomalies > 0) {
                items.push({
                    id: 'anomalies-hot',
                    tone: 'action',
                    text: fill(t.anomalyHot, { count: model.finops.hotAnomalies }),
                    href: '/finops/anomalies',
                });
            } else if (model.finops.openAnomalies > 0) {
                items.push({
                    id: 'anomalies-open',
                    tone: 'watch',
                    text: fill(t.anomalyOpen, { count: model.finops.openAnomalies }),
                    href: '/finops/anomalies',
                });
            }

            const overBudget = model.budgets.filter((budget) => budget.usagePercentage >= 100).length;
            const nearBudget = model.budgets.filter((budget) => budget.usagePercentage >= 80 && budget.usagePercentage < 100).length;
            if (overBudget > 0) {
                items.push({ id: 'budget-over', tone: 'action', text: fill(t.budgetOver, { count: overBudget }), href: '/finops/budgets' });
            } else if (nearBudget > 0) {
                items.push({ id: 'budget-near', tone: 'watch', text: fill(t.budgetNear, { count: nearBudget }), href: '/finops/budgets' });
            }

            if (model.finops.momGrowth >= 20) {
                items.push({
                    id: 'cost-growth',
                    tone: 'watch',
                    text: fill(t.costGrowth, { percent: formatPercent(model.finops.momGrowth, dateLocale, true) }),
                    href: '/finops',
                });
            }

            if (model.finops.potentialSavings > 0) {
                items.push({
                    id: 'savings',
                    tone: 'opportunity',
                    text: fill(t.savingsOpportunity, {
                        amount: formatMoney(model.finops.potentialSavings, model.finops.currency, dateLocale),
                    }),
                    href: '/finops/recommendations',
                });
            }
        }
    }

    const rank: Record<DecisionTone, number> = { action: 0, watch: 1, opportunity: 2 };
    return items.sort((left, right) => rank[left.tone] - rank[right.tone]);
}

function positiveFromOrg(value: number): number | null {
    return value > 0 ? value : null;
}

function pushLimit(
    items: DecisionItem[],
    id: string,
    level: 'ok' | 'near' | 'full',
    fullText: string,
    nearText: string,
    used: number,
    limit: number | null,
    href: string
) {
    if (level === 'ok' || limit == null) return;
    items.push({
        id: `${id}-${level}`,
        tone: level === 'full' ? 'action' : 'watch',
        text: fill(level === 'full' ? fullText : nearText, { used, limit }),
        href,
    });
}

function statusLabel(status: string, t: HomeCopy) {
    if (status === 'active') return t.statusActive;
    if (status === 'trialing') return t.statusTrial;
    return t.statusInactive;
}

function formatDate(value: string, dateLocale: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatMoney(value: number, currency: string, dateLocale: string) {
    try {
        return new Intl.NumberFormat(dateLocale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
    } catch {
        return new Intl.NumberFormat(dateLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
    }
}

function formatPercent(value: number, dateLocale: string, signed = false) {
    return (
        new Intl.NumberFormat(dateLocale, {
            maximumFractionDigits: 1,
            signDisplay: signed ? 'exceptZero' : 'auto',
        }).format(value) + '%'
    );
}

function moduleLabels(modules: string[], t: HomeCopy) {
    const normalized = normalizePlanModules(modules);
    if (normalized.includes('*')) return [t.allModules];
    if (normalized.length === 0) return [];

    return normalized.map((moduleName) => {
        if (moduleName === PlanModule.ASSESSMENT) return t.moduleAssessment;
        if (moduleName === PlanModule.CLOUD_INVENTORY) return t.moduleInventory;
        if (moduleName === PlanModule.FINOPS) return t.moduleFinops;
        if (moduleName === PlanModule.GOVERNANCE) return t.moduleGovernance;
        if (moduleName === PlanModule.AUTOMATION) return t.moduleAutomation;
        return moduleName;
    });
}

function toneLabel(tone: DecisionTone, t: HomeCopy) {
    if (tone === 'action') return t.toneAction;
    if (tone === 'watch') return t.toneWatch;
    return t.toneOpportunity;
}

function Meter({ value, tone }: { value: number; tone: 'ok' | 'near' | 'full' | 'good' | 'fair' | 'low' }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
                className={cn(
                    'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
                    (tone === 'ok' || tone === 'good') && 'bg-primary',
                    (tone === 'near' || tone === 'fair') && 'bg-warning',
                    (tone === 'full' || tone === 'low') && 'bg-destructive'
                )}
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    );
}

function MetricCard({
    label,
    value,
    hint,
    icon,
    valueClassName,
    href,
}: {
    label: string;
    value: string;
    hint: string;
    icon: ReactNode;
    valueClassName?: string;
    href?: string;
}) {
    const body = (
        <>
            <CardHeader className="gap-2 pb-0">
                <CardDescription className="flex min-h-4 items-center gap-1.5 truncate">
                    {icon}
                    <span className="truncate">{label}</span>
                </CardDescription>
                <CardTitle className={cn('truncate text-xl tabular-nums sm:text-2xl', valueClassName)} title={value}>
                    {value}
                </CardTitle>
            </CardHeader>
            <CardContent className="mt-auto">
                <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground" title={hint}>
                    {hint}
                </p>
            </CardContent>
        </>
    );

    const cardClassName = 'h-full min-h-28 justify-between';

    if (!href) {
        return (
            <Card size="sm" className={cardClassName}>
                {body}
            </Card>
        );
    }

    return (
        <Link
            href={href}
            className="group/card block h-full rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
            <Card size="sm" className={cn(cardClassName, 'transition-colors group-hover/card:bg-muted/40')}>
                {body}
            </Card>
        </Link>
    );
}

function KpiStrip({ t, model, dateLocale }: { t: HomeCopy; model: DashboardModel; dateLocale: string }) {
    const finops = model.finops?.state === 'ready' ? model.finops : null;
    const scanned = model.governance.filter((account) => account.score);
    const worst = [...scanned].sort((left, right) => (left.score?.score ?? 100) - (right.score?.score ?? 100))[0];
    const growthDown = (finops?.momGrowth ?? 0) <= 0;

    return (
        <div className="grid auto-rows-fr grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard
                label={t.kpiCost}
                value={finops ? formatMoney(finops.cost, finops.currency, dateLocale) : '—'}
                hint={
                    finops
                        ? fill(t.kpiPrevious, { amount: formatMoney(finops.previousCost, finops.currency, dateLocale) })
                        : t.kpiCostHint
                }
                icon={<Wallet className="size-3.5" />}
                href={model.finopsLocked ? undefined : '/finops'}
            />
            <MetricCard
                label={t.kpiGrowth}
                value={finops ? formatPercent(finops.momGrowth, dateLocale, true) : '—'}
                hint={finops ? (finops.momGrowth === 0 ? t.kpiGrowthFlat : growthDown ? t.kpiGrowthDown : t.kpiGrowthUp) : t.kpiVsPrevious}
                icon={growthDown ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
                valueClassName={finops ? (growthDown ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive') : undefined}
                href={model.finopsLocked ? undefined : '/finops'}
            />
            <MetricCard
                label={t.kpiForecast}
                value={
                    finops?.forecastedCost != null ? formatMoney(finops.forecastedCost, finops.currency, dateLocale) : '—'
                }
                hint={finops?.forecastedCost != null ? t.kpiForecastHint : t.kpiForecastEmpty}
                icon={<Target className="size-3.5" />}
                href={model.finopsLocked ? undefined : '/finops/forecast'}
            />
            <MetricCard
                label={t.kpiSavings}
                value={finops ? formatMoney(finops.potentialSavings, finops.currency, dateLocale) : '—'}
                hint={fill(t.kpiSavingsHint, { count: finops?.openRecommendations ?? 0 })}
                icon={<PiggyBank className="size-3.5" />}
                valueClassName={finops && finops.potentialSavings > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined}
                href={model.finopsLocked ? undefined : '/finops/recommendations'}
            />
            <MetricCard
                label={t.kpiAnomalies}
                value={String(finops?.openAnomalies ?? 0)}
                hint={
                    finops && finops.openAnomalies > 0
                        ? fill(t.kpiAnomaliesHint, { impact: formatMoney(finops.anomalyImpact, finops.currency, dateLocale) })
                        : t.kpiAnomaliesEmpty
                }
                icon={<AlertTriangle className="size-3.5" />}
                valueClassName={finops && finops.hotAnomalies > 0 ? 'text-destructive' : undefined}
                href={model.finopsLocked ? undefined : '/finops/anomalies'}
            />
            <MetricCard
                label={t.kpiGovScore}
                value={worst?.score ? `${Math.round(worst.score.score)}` : '—'}
                hint={
                    worst?.score
                        ? fill(t.kpiGovScoreHint, { account: worst.alias })
                        : t.kpiGovScoreEmpty
                }
                icon={<ShieldCheck className="size-3.5" />}
                valueClassName={
                    worst?.score
                        ? scoreTone(worst.score.score) === 'low'
                            ? 'text-destructive'
                            : scoreTone(worst.score.score) === 'fair'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        : undefined
                }
                href="/governance"
            />
        </div>
    );
}

function DecisionQueue({ t, decisions, hiddenCount }: { t: HomeCopy; decisions: DecisionItem[]; hiddenCount: number }) {
    if (decisions.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-4" />
                        </span>
                        <div className="space-y-1">
                            <CardTitle>{t.clearTitle}</CardTitle>
                            <CardDescription>{t.clearDesc}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>
        );
    }

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h2 className="text-base font-medium tracking-tight">{t.decisionsTitle}</h2>
                    <p className="text-sm text-muted-foreground">
                        {fill(t.decisionsCount, { count: decisions.length + hiddenCount })}
                    </p>
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {decisions.map((item) => (
                    <Link
                        key={item.id}
                        href={item.href}
                        className="group/card block h-full rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                        <Card size="sm" className="h-full transition-colors group-hover/card:bg-muted/40">
                            <CardHeader>
                                <Badge
                                    variant={item.tone === 'action' ? 'destructive' : item.tone === 'opportunity' ? 'secondary' : 'outline'}
                                    className={cn(item.tone === 'watch' && 'border-transparent bg-warning text-warning-foreground')}
                                >
                                    {toneLabel(item.tone, t)}
                                </Badge>
                                <CardTitle className="text-sm leading-snug text-pretty">{item.text}</CardTitle>
                                <CardAction>
                                    <span className="inline-flex size-8 items-center justify-center text-muted-foreground transition-colors group-hover/card:text-foreground">
                                        <ArrowRight className="size-4" />
                                    </span>
                                </CardAction>
                            </CardHeader>
                            <CardContent>
                                <span className="text-sm font-medium text-primary">{t.open}</span>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>
            {hiddenCount > 0 ? <p className="text-sm text-muted-foreground">{fill(t.decisionsMore, { count: hiddenCount })}</p> : null}
        </section>
    );
}

function FinopsPanel({
    className,
    t,
    model,
    dateLocale,
}: {
    className?: string;
    t: HomeCopy;
    model: DashboardModel;
    dateLocale: string;
}) {
    const finops = model.finops;
    const riskBudgets = model.budgets.filter((budget) => budget.usagePercentage >= 80).slice(0, 4);
    const serviceMax = finops?.services[0]?.cost ?? 0;

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>{t.finopsTitle}</CardTitle>
                <CardDescription>{t.finopsHint}</CardDescription>
                {!model.finopsLocked ? (
                    <CardAction>
                        <Button variant="link" size="sm" asChild>
                            <Link href="/finops">{t.openFinops}</Link>
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-5">
                {model.finopsLocked ? <p className="text-sm text-pretty">{t.finopsLocked}</p> : null}
                {model.finopsFailed ? <p className="text-sm text-pretty">{t.finopsError}</p> : null}
                {!model.finopsLocked && !model.finopsFailed && finops?.state !== 'ready' ? (
                    <p className="text-sm text-pretty">
                        {model.accounts.some((account) => isFinopsProvider(account.provider)) && finops?.consentedAccounts === 0
                            ? t.finopsNoConsent
                            : t.finopsEmpty}
                    </p>
                ) : null}

                {finops?.state === 'ready' ? (
                    <>
                        <div className="space-y-3">
                            <h3 className="text-xs font-medium text-muted-foreground">{t.topServices}</h3>
                            {finops.services.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t.noServices}</p>
                            ) : (
                                <ul className="space-y-3">
                                    {finops.services.map((service) => (
                                        <li key={service.service} className="space-y-1.5">
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="min-w-0 truncate font-medium" title={service.service}>
                                                    {service.service}
                                                </span>
                                                <span className="shrink-0 tabular-nums">
                                                    {formatMoney(service.cost, service.currency, dateLocale)}
                                                </span>
                                            </div>
                                            <Meter
                                                value={serviceMax > 0 ? (service.cost / serviceMax) * 100 : 0}
                                                tone={service.changePercentage >= 20 ? 'near' : 'ok'}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {formatPercent(service.changePercentage, dateLocale, true)} ·{' '}
                                                {fill(t.kpiPrevious, {
                                                    amount: formatMoney(service.previousCost, service.currency, dateLocale),
                                                })}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-xs font-medium text-muted-foreground">{t.topAccounts}</h3>
                            {finops.accounts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t.noAccountSpend}</p>
                            ) : (
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {finops.accounts.slice(0, 4).map((account) => (
                                        <div key={account.id} className="rounded-lg bg-muted/50 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium" title={account.alias}>
                                                        {account.alias}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{providerLabel(account.provider)}</p>
                                                </div>
                                                <p className="shrink-0 text-sm font-medium tabular-nums">
                                                    {formatMoney(account.totalCost, finops.currency, dateLocale)}
                                                </p>
                                            </div>
                                            {(account.openAnomalies > 0 || account.openRecs > 0) && (
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {fill(t.accountSignals, {
                                                        anomalies: account.openAnomalies,
                                                        recs: account.openRecs,
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-xs font-medium text-muted-foreground">{t.budgetsTitle}</h3>
                                <Button variant="link" size="sm" className="h-auto px-0" asChild>
                                    <Link href="/finops/budgets">{t.open}</Link>
                                </Button>
                            </div>
                            {riskBudgets.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t.budgetsClear}</p>
                            ) : (
                                <ul className="space-y-3">
                                    {riskBudgets.map((budget) => {
                                        const tone = budget.usagePercentage >= 100 ? 'full' : 'near';
                                        return (
                                            <li key={`${budget.accountAlias}-${budget.name}`} className="space-y-1.5 rounded-lg bg-muted/50 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium">{budget.name}</p>
                                                        <p className="text-xs text-muted-foreground">{budget.accountAlias}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={cn('text-sm font-medium tabular-nums', tone === 'full' && 'text-destructive')}>
                                                            {formatPercent(budget.usagePercentage, dateLocale)}
                                                        </p>
                                                        {tone === 'full' ? (
                                                            <Badge variant="destructive">{t.budgetOverLabel}</Badge>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <Meter value={budget.usagePercentage} tone={tone} />
                                                <p className="text-xs text-muted-foreground">
                                                    {fill(t.budgetSpend, {
                                                        spent: formatMoney(budget.currentSpend, budget.currency, dateLocale),
                                                        limit: formatMoney(budget.amount, budget.currency, dateLocale),
                                                    })}
                                                    {' · '}
                                                    {fill(t.budgetRemaining, {
                                                        amount: formatMoney(Math.max(0, budget.remainingAmount), budget.currency, dateLocale),
                                                    })}
                                                </p>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <p className="text-xs text-muted-foreground">{t.periodNote}</p>
                    </>
                ) : null}
            </CardContent>
        </Card>
    );
}

function GovernancePanel({
    className,
    t,
    model,
    dateLocale,
}: {
    className?: string;
    t: HomeCopy;
    model: DashboardModel;
    dateLocale: string;
}) {
    const modules = normalizePlanModules(model.subscription?.modules.length ? model.subscription.modules : model.org.plans);
    const enabled = hasModuleAccess(modules, PlanModule.GOVERNANCE);
    const scanned = model.governance.filter((account) => account.score);
    const worst = [...scanned].sort((left, right) => (left.score?.score ?? 100) - (right.score?.score ?? 100))[0];
    const avg =
        scanned.length > 0
            ? Math.round(scanned.reduce((sum, account) => sum + (account.score?.score ?? 0), 0) / scanned.length)
            : null;
    const critical = scanned.reduce((sum, account) => sum + (account.score?.criticalFindings ?? 0), 0);
    const high = scanned.reduce((sum, account) => sum + (account.score?.highFindings ?? 0), 0);
    const visible = [...model.governance]
        .sort((left, right) => {
            if (left.score && right.score) return left.score.score - right.score.score;
            if (left.score) return -1;
            if (right.score) return 1;
            return left.alias.localeCompare(right.alias);
        })
        .slice(0, VISIBLE_ACCOUNTS);
    const hidden = Math.max(0, model.governance.length - visible.length);

    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>{t.governanceTitle}</CardTitle>
                <CardDescription>{t.governanceHint}</CardDescription>
                {enabled ? (
                    <CardAction>
                        <Button variant="link" size="sm" asChild>
                            <Link href="/governance">{t.openGovernance}</Link>
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
                {!enabled ? <p className="text-sm text-pretty">{t.governanceLocked}</p> : null}
                {enabled && model.governanceFailed ? <p className="text-sm text-pretty">{t.governanceError}</p> : null}
                {enabled && !model.governanceFailed && model.accounts.length === 0 ? (
                    <p className="text-sm text-pretty">{t.governanceEmpty}</p>
                ) : null}
                {enabled && !model.governanceFailed && model.accounts.length > 0 && scanned.length === 0 ? (
                    <p className="text-sm text-pretty">{t.governanceNoScores}</p>
                ) : null}

                {worst?.score && avg != null ? (
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">{t.worstScore}</p>
                            <p
                                className={cn(
                                    'mt-1 text-2xl font-semibold tabular-nums',
                                    scoreTone(worst.score.score) === 'low' && 'text-destructive',
                                    scoreTone(worst.score.score) === 'fair' && 'text-amber-700 dark:text-amber-400',
                                    scoreTone(worst.score.score) === 'good' && 'text-emerald-600 dark:text-emerald-400'
                                )}
                            >
                                {Math.round(worst.score.score)}
                            </p>
                            <p className="truncate text-xs text-muted-foreground" title={worst.alias}>
                                {worst.alias}
                            </p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">{t.avgScore}</p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums">{avg}</p>
                            <p className="text-xs text-muted-foreground">
                                {fill(t.scannedAccounts, { scanned: scanned.length, total: model.governance.length })}
                            </p>
                        </div>
                    </div>
                ) : null}

                {worst?.score ? (
                    <p className="text-sm text-pretty">
                        {fill(t.governanceSummary, {
                            score: Math.round(worst.score.score),
                            account: worst.alias,
                            critical,
                            high,
                        })}
                    </p>
                ) : null}

                {visible.length > 0 ? (
                    <ul className="space-y-2">
                        {visible.map((account) => {
                            const tone = account.score ? scoreTone(account.score.score) : null;
                            return (
                                <li key={account.id} className="rounded-lg bg-muted/50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium" title={account.alias}>
                                                {account.alias}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{providerLabel(account.provider)}</p>
                                        </div>
                                        {account.score ? (
                                            <div className="text-right">
                                                <p
                                                    className={cn(
                                                        'text-sm font-semibold tabular-nums',
                                                        tone === 'low' && 'text-destructive',
                                                        tone === 'fair' && 'text-amber-700 dark:text-amber-400',
                                                        tone === 'good' && 'text-emerald-600 dark:text-emerald-400'
                                                    )}
                                                >
                                                    {Math.round(account.score.score)}
                                                    <span className="font-normal text-muted-foreground">/100</span>
                                                </p>
                                                <Badge variant={tone === 'low' ? 'destructive' : tone === 'fair' ? 'outline' : 'secondary'}>
                                                    {tone === 'low' ? t.scoreLow : tone === 'fair' ? t.scoreFair : t.scoreGood}
                                                </Badge>
                                            </div>
                                        ) : (
                                            <Badge variant="outline">{t.notScanned}</Badge>
                                        )}
                                    </div>
                                    {account.score ? (
                                        <div className="mt-2 space-y-1.5">
                                            <Meter value={account.score.score} tone={tone ?? 'ok'} />
                                            <p className="text-xs text-muted-foreground">
                                                {fill(t.findingsShort, {
                                                    critical: account.score.criticalFindings,
                                                    high: account.score.highFindings,
                                                })}
                                                {account.score.evaluatedAt
                                                    ? ` · ${fill(t.evaluatedAt, { date: formatDate(account.score.evaluatedAt, dateLocale) })}`
                                                    : null}
                                            </p>
                                        </div>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
                {hidden > 0 ? <p className="text-sm text-muted-foreground">{fill(t.moreAccounts, { count: hidden })}</p> : null}
            </CardContent>
        </Card>
    );
}

function PlanPanel({ t, model, dateLocale }: { t: HomeCopy; model: DashboardModel; dateLocale: string }) {
    const subscription = model.subscription;
    const modules = moduleLabels(subscription?.modules.length ? subscription.modules : model.org.plans, t);
    const cloudLimit = subscription?.maxCloudAccounts ?? positiveFromOrg(model.org.maxCloudAccounts);
    const userLimit = subscription?.maxUsers ?? positiveFromOrg(model.org.maxUsers);
    const orgLimit = subscription?.maxOrgAccounts ?? null;
    const renewal = subscription?.currentPeriodEnd
        ? fill(subscription.cancelAtPeriodEnd ? t.endsOn : t.renewal, {
              date: formatDate(subscription.currentPeriodEnd, dateLocale),
          })
        : t.renewalMissing;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t.planTitle}</CardTitle>
                <CardDescription>
                    {model.planUnavailable
                        ? t.planLoadError
                        : subscription
                          ? `${subscription.planName ?? t.noModules} · ${statusLabel(subscription.status, t)} · ${renewal}`
                          : t.planMissing}
                </CardDescription>
                <CardAction>
                    <Button variant="link" size="sm" asChild>
                        <Link href="/billing">{t.managePlan}</Link>
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    <UsageCard label={t.usageCloud} used={model.cloudTotal} limit={cloudLimit} t={t} />
                    <UsageCard label={t.usageOrgs} used={model.orgTotal} limit={orgLimit} t={t} />
                    <UsageCard label={t.usageUsers} used={model.userTotal} limit={userLimit} t={t} />
                </div>
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t.modules}</p>
                    {modules.length === 0 ? (
                        <p className="text-sm">{t.noModules}</p>
                    ) : (
                        <ul className="flex flex-wrap gap-2">
                            {modules.map((moduleName) => (
                                <li key={moduleName}>
                                    <Badge variant="outline">{moduleName}</Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function UsageCard({ label, used, limit, t }: { label: string; used: number | null; limit: number | null; t: HomeCopy }) {
    const level = used == null ? 'ok' : pressure(used, limit);
    const percent = used != null && limit != null && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

    return (
        <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                {level === 'full' ? <Badge variant="destructive">{t.atLimit}</Badge> : null}
                {level === 'near' ? <Badge className="border-transparent bg-warning text-warning-foreground">{t.nearLimit}</Badge> : null}
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums">
                {used == null ? t.usageUnknown : limit == null ? String(used) : fill(t.usageOf, { used, limit })}
            </p>
            {used != null && limit != null ? (
                <div className="mt-2 space-y-1.5">
                    <Meter value={percent} tone={level} />
                    <p className="text-xs text-muted-foreground">
                        {fill(t.remainingSlots, { count: Math.max(0, limit - used) })}
                    </p>
                </div>
            ) : used != null && limit == null ? (
                <p className="mt-1 text-xs text-muted-foreground">{t.noLimit}</p>
            ) : null}
        </div>
    );
}

function EmptyTenant({ t }: { t: HomeCopy }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t.selectOrgTitle}</CardTitle>
                <CardDescription>{t.selectOrgDescription}</CardDescription>
            </CardHeader>
        </Card>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{message}</CardTitle>
            </CardHeader>
        </Card>
    );
}

function DashboardSkeleton() {
    return (
        <div className="flex flex-col gap-4" aria-hidden="true">
            <div className="grid auto-rows-fr grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="min-h-28 rounded-xl" />
                ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
            </div>
            <div className="grid gap-4 lg:grid-cols-5">
                <Skeleton className="h-96 rounded-xl lg:col-span-3" />
                <Skeleton className="h-96 rounded-xl lg:col-span-2" />
            </div>
            <Skeleton className="h-40 w-full rounded-xl" />
        </div>
    );
}
