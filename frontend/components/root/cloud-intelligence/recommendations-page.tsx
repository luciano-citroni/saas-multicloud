'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowLeft,
    ChevronDown,
    CircleAlert,
    Loader2,
    RefreshCw,
    Sparkles,
    Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    acknowledgeCloudIntelligenceAnomaly,
    executeCloudIntelligenceRecommendation,
    fetchCloudIntelligenceRecommendations,
    prepareCloudIntelligenceAutomation,
    updateCloudIntelligenceRecommendationStatus,
    type AiRecommendation,
} from '@/app/actions/cloud-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/components/providers/locale-provider';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';
import {
    canAutomateRecommendation,
    getAllowedRecommendationStatusTransitions,
    isCostAnomalyRecommendation,
    useCiLabels,
    type CiCategory,
    type CiStatus,
} from './ci-labels';
import { CiPageHeader } from './ci-page-header';
import { RecommendationDetailBody } from './recommendation-detail';

function unwrapList(body: unknown): AiRecommendation[] {
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
        return (body as { items: AiRecommendation[] }).items;
    }
    return [];
}

function statusBadgeClass(status: string) {
    switch (status) {
        case 'NEW':
            return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
        case 'REVIEWING':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'APPROVED':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'REJECTED':
        case 'FAILED':
            return 'border-destructive/30 bg-destructive/10 text-destructive';
        case 'EXECUTING':
            return 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300';
        case 'COMPLETED':
            return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200';
        case 'DISMISSED':
            return 'border-border bg-muted text-muted-foreground';
        default:
            return '';
    }
}

export function CloudIntelligenceRecommendationsPanel() {
    const t = useTranslations('cloudIntelligence');
    const {
        statusLabel,
        statusActionLabel,
        categoryLabel,
        severityLabel,
        recommendationTitle,
        recommendationDescription,
        resourceTypeLabel,
        plannedActionLabel,
        finopsTypeLabel,
        STATUS_KEYS,
        CATEGORY_KEYS,
    } = useCiLabels();
    const { locale } = useLocale();
    const router = useRouter();
    const searchParams = useSearchParams();

    const isRecStatus = (value: string | null): value is CiStatus =>
        value !== null && (STATUS_KEYS as readonly string[]).includes(value);
    const isRecCategory = (value: string | null): value is CiCategory =>
        value !== null && (CATEGORY_KEYS as readonly string[]).includes(value);

    const status = isRecStatus(searchParams.get('status')) ? searchParams.get('status')! : undefined;
    const category = isRecCategory(searchParams.get('category'))
        ? searchParams.get('category')!
        : undefined;
    const [pending, startTransition] = useTransition();
    const [items, setItems] = useState<AiRecommendation[]>([]);
    const [selected, setSelected] = useState<AiRecommendation | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [actionPending, setActionPending] = useState<string | null>(null);
    const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list');
    const selectedId = searchParams.get('id') ?? undefined;

    const filterKey = useMemo(
        () => `${status ?? ''}|${category ?? ''}|${selectedId ?? ''}`,
        [status, category, selectedId],
    );
    const numberLocale = locale === 'en' ? 'en-US' : 'pt-BR';

    const replaceRecsUrl = (patch: { status?: string; category?: string; id?: string | null }) => {
        const next = new URLSearchParams(searchParams.toString());
        next.delete('tab');
        next.delete('provider');
        next.delete('severity');
        next.delete('account');

        if ('status' in patch) {
            if (!patch.status) next.delete('status');
            else next.set('status', patch.status);
        }
        if ('category' in patch) {
            if (!patch.category) next.delete('category');
            else next.set('category', patch.category);
        }
        if ('id' in patch) {
            if (!patch.id) next.delete('id');
            else next.set('id', patch.id);
        }

        const query = next.toString();
        router.replace(
            query
                ? `/cloud-intelligence/recommendations?${query}`
                : '/cloud-intelligence/recommendations',
            { scroll: false },
        );
    };

    const load = () => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId) {
            setLoaded(true);
            setItems([]);
            return;
        }
        startTransition(async () => {
            const res = await fetchCloudIntelligenceRecommendations(organizationId, {
                status,
                category,
            });
            if (!res.ok) {
                toast.error(extractErrorMessage(await res.json().catch(() => ({}))));
                setLoaded(true);
                return;
            }
            const list = unwrapList(await res.json());
            setItems(list);
            const fromUrl = selectedId ? list.find((item) => item.id === selectedId) : null;
            setSelected((current) => {
                if (fromUrl) return fromUrl;
                if (!current) return null;
                return list.find((item) => item.id === current.id) ?? null;
            });
            if (fromUrl) setMobilePane('detail');
            setLoaded(true);
        });
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey]);

    const withOrg = async (fn: (orgId: string) => Promise<Response>) => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId) return;
        const res = await fn(organizationId);
        if (!res.ok) {
            toast.error(extractErrorMessage(await res.json().catch(() => ({}))));
            return null;
        }
        return res.json();
    };

    const selectItem = (item: AiRecommendation) => {
        setSelected(item);
        setMobilePane('detail');
        replaceRecsUrl({ id: item.id });
    };

    const formatSaving = (item: AiRecommendation) => {
        const saving = item.estimatedImpact?.potentialSaving;
        if (typeof saving !== 'number') return null;
        const currency =
            typeof item.estimatedImpact?.currency === 'string'
                ? item.estimatedImpact.currency
                : 'USD';
        return new Intl.NumberFormat(numberLocale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(saving);
    };

    const changeSelectedStatus = async (nextStatus: string) => {
        if (!selected || nextStatus === selected.status) return;
        setActionPending(nextStatus);
        try {
            const body = await withOrg((orgId) =>
                updateCloudIntelligenceRecommendationStatus(orgId, selected.id, nextStatus),
            );
            if (!body) return;
            toast.success(t.statusUpdated);
            setSelected(body as AiRecommendation);
            load();
        } finally {
            setActionPending(null);
        }
    };

    const selectedRef = selected?.resourceReference as
        | {
              automationId?: string;
              plannedActions?: string[];
              readyToExecute?: boolean;
          }
        | null
        | undefined;
    const selectedAutomationId = selectedRef?.automationId;
    const selectedReadyToExecute = Boolean(selectedRef?.readyToExecute);
    const selectedIsAnomaly = selected ? isCostAnomalyRecommendation(selected) : false;
    const selectedCanAutomate = selected ? canAutomateRecommendation(selected) : false;
    const selectedAllowedStatuses = selected
        ? getAllowedRecommendationStatusTransitions(selected.status)
        : [];
    const isStatusUpdating = selectedAllowedStatuses.some((statusKey) => actionPending === statusKey);

    const statusControl = selected ? (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={actionPending !== null || selectedAllowedStatuses.length === 0}
                    className={cn(
                        'h-8 gap-1.5 rounded-full border px-2.5 font-medium shadow-none',
                        statusBadgeClass(selected.status),
                    )}
                    aria-label={t.changeStatus}
                >
                    {isStatusUpdating ? (
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    <span>{statusLabel(selected.status)}</span>
                    {selectedAllowedStatuses.length > 0 ? (
                        <ChevronDown className="size-3.5 opacity-70" />
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            {selectedAllowedStatuses.length > 0 ? (
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel>{t.changeStatus}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {selectedAllowedStatuses.map((nextStatus) => (
                        <DropdownMenuItem
                            key={nextStatus}
                            disabled={actionPending !== null}
                            onSelect={() => {
                                void changeSelectedStatus(nextStatus);
                            }}
                        >
                            {statusActionLabel(nextStatus)}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            ) : null}
        </DropdownMenu>
    ) : null;

    const detailFooter = selected ? (
        selectedIsAnomaly ? (
            <div className="space-y-3">
                <p className="text-muted-foreground text-xs leading-relaxed">
                    {t.anomalyActionsDesc}
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        disabled={actionPending !== null}
                        isLoading={actionPending === 'acknowledge'}
                        onClick={async () => {
                            setActionPending('acknowledge');
                            try {
                                const body = await withOrg((orgId) =>
                                    acknowledgeCloudIntelligenceAnomaly(orgId, selected.id),
                                );
                                if (!body) return;
                                toast.success(t.acknowledgeAnomalySuccess);
                                setSelected(null);
                                setMobilePane('list');
                                load();
                            } finally {
                                setActionPending(null);
                            }
                        }}
                    >
                        {t.acknowledgeAnomaly}
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={actionPending !== null}
                        isLoading={actionPending === 'DISMISSED'}
                        onClick={async () => {
                            setActionPending('DISMISSED');
                            try {
                                const body = await withOrg((orgId) =>
                                    updateCloudIntelligenceRecommendationStatus(
                                        orgId,
                                        selected.id,
                                        'DISMISSED',
                                    ),
                                );
                                if (!body) return;
                                toast.success(t.dismissAnomalySuccess);
                                setSelected(null);
                                setMobilePane('list');
                                load();
                            } finally {
                                setActionPending(null);
                            }
                        }}
                    >
                        {t.dismissAnomaly}
                    </Button>
                </div>
            </div>
        ) : selectedCanAutomate ? (
            <div className="space-y-3">
                <div className="space-y-1">
                    <p className="text-sm font-medium">{t.securityGateTitle}</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                        {selectedAutomationId ? t.automationReadyHint : t.securityGateDesc}
                    </p>
                    {!selectedAutomationId && Array.isArray(selectedRef?.plannedActions) ? (
                        <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
                            {selectedRef.plannedActions.map((action) => (
                                <li key={action}>{plannedActionLabel(action)}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
                {selectedAutomationId ? (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => router.push(`/automations/${selectedAutomationId}`)}
                        >
                            <Workflow className="size-3.5" />
                            {t.viewAutomation}
                        </Button>
                        {selectedReadyToExecute ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={actionPending !== null}
                                isLoading={actionPending === 'execute'}
                                onClick={async () => {
                                    setActionPending('execute');
                                    try {
                                        const body = await withOrg((orgId) =>
                                            executeCloudIntelligenceRecommendation(
                                                orgId,
                                                selected.id,
                                            ),
                                        );
                                        if (!body) return;
                                        toast.success(t.executeSuccess);
                                        load();
                                    } finally {
                                        setActionPending(null);
                                    }
                                }}
                            >
                                {t.executeAutomation}
                            </Button>
                        ) : null}
                    </div>
                ) : (
                    <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={actionPending !== null}
                        isLoading={actionPending === 'prepare'}
                        onClick={async () => {
                            setActionPending('prepare');
                            try {
                                const body = await withOrg((orgId) =>
                                    prepareCloudIntelligenceAutomation(orgId, selected.id),
                                );
                                if (!body) return;
                                const ready = Boolean(
                                    (body as { readyToExecute?: boolean }).readyToExecute,
                                );
                                const nextAutomationId = (body as { automationId?: string })
                                    .automationId;
                                const editorUrl =
                                    (body as { editorUrl?: string }).editorUrl ??
                                    (nextAutomationId
                                        ? `/automations/${nextAutomationId}`
                                        : undefined);
                                toast.success(ready ? t.prepareSuccess : t.prepareDraftOnly);
                                if (editorUrl) {
                                    router.push(editorUrl);
                                    return;
                                }
                                load();
                            } finally {
                                setActionPending(null);
                            }
                        }}
                    >
                        <Workflow className="size-3.5" />
                        {t.prepareAutomation}
                    </Button>
                )}
            </div>
        ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">{t.noAutomationHint}</p>
        )
    ) : null;

    const listPane = (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-col gap-3 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-xs">
                        {t.itemsCount.replace('{count}', String(items.length))}
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 px-2"
                        disabled={pending}
                        onClick={() => load()}
                    >
                        <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} />
                        {t.refreshList}
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Select
                        value={status ?? 'all'}
                        onValueChange={(value) =>
                            replaceRecsUrl({ status: value === 'all' ? undefined : value })
                        }
                    >
                        <SelectTrigger className="w-full" size="sm">
                            <SelectValue placeholder={t.filterStatus} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t.filterAllStatuses}</SelectItem>
                            {STATUS_KEYS.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {statusLabel(value)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select
                        value={category ?? 'all'}
                        onValueChange={(value) =>
                            replaceRecsUrl({ category: value === 'all' ? undefined : value })
                        }
                    >
                        <SelectTrigger className="w-full" size="sm">
                            <SelectValue placeholder={t.filterCategory} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t.filterAllCategories}</SelectItem>
                            {CATEGORY_KEYS.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {categoryLabel(value)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <Separator className="shrink-0" />
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto overscroll-contain px-2 py-2">
                    {!loaded || (pending && items.length === 0) ? (
                        <p className="text-muted-foreground px-2 py-8 text-center text-sm">
                            {t.loading}
                        </p>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                            <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
                                <CircleAlert className="size-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    {status || category
                                        ? t.noRecommendationsForFilters
                                        : t.noRecommendations}
                                </p>
                                {!status && !category ? (
                                    <div className="space-y-2">
                                        <p className="text-muted-foreground max-w-[220px] text-xs leading-relaxed">
                                            {t.recommendationsEmptyHint}
                                        </p>
                                        <Button asChild size="sm" variant="outline">
                                            <Link href="/cloud-intelligence">{t.goToDaily}</Link>
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <ItemGroup className="gap-2 p-1">
                            {items.map((item) => {
                                const isActive = selected?.id === item.id;
                                const saving = formatSaving(item);
                                const rankingScore =
                                    typeof item.estimatedImpact?.rankingScore === 'number'
                                        ? item.estimatedImpact.rankingScore
                                        : null;
                                const correlated = Array.isArray(item.evidence?.sources)
                                    ? item.evidence.sources.length > 1
                                    : false;
                                return (
                                    <Item
                                        key={item.id}
                                        role="listitem"
                                        tabIndex={0}
                                        size="sm"
                                        variant={isActive ? 'muted' : 'outline'}
                                        aria-selected={isActive}
                                        className={cn(
                                            'cursor-pointer hover:bg-muted/60',
                                            isActive &&
                                                'border-primary/40 bg-primary/10 ring-primary/20 ring-1',
                                        )}
                                        onClick={() => selectItem(item)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                selectItem(item);
                                            }
                                        }}
                                    >
                                        <ItemMedia
                                            variant="icon"
                                            className={cn(
                                                'bg-background size-9 rounded-lg border',
                                                isActive
                                                    ? 'border-primary/30 text-primary'
                                                    : 'border-border text-muted-foreground',
                                            )}
                                        >
                                            <Sparkles className="size-4" />
                                        </ItemMedia>
                                        <ItemContent className="min-w-0">
                                            <ItemTitle className="line-clamp-2 w-full max-w-none whitespace-normal">
                                                {recommendationTitle(item.title)}
                                            </ItemTitle>
                                            <ItemDescription className="line-clamp-2">
                                                {recommendationDescription(item.description)}
                                            </ItemDescription>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <Badge
                                                    variant="secondary"
                                                    className="h-5 px-1.5 text-[10px]"
                                                >
                                                    {severityLabel(item.severity)}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'h-5 px-1.5 text-[10px]',
                                                        statusBadgeClass(item.status),
                                                    )}
                                                >
                                                    {statusLabel(item.status)}
                                                </Badge>
                                                {rankingScore != null ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="h-5 px-1.5 text-[10px] tabular-nums"
                                                    >
                                                        {t.rankingScore} {Math.round(rankingScore)}
                                                    </Badge>
                                                ) : null}
                                                {correlated ? (
                                                    <Badge className="h-5 px-1.5 text-[10px]">
                                                        {t.correlatedBadge}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </ItemContent>
                                        {saving ? (
                                            <ItemActions className="self-start">
                                                <span className="text-muted-foreground text-[11px] tabular-nums">
                                                    ~{saving}
                                                </span>
                                            </ItemActions>
                                        ) : null}
                                    </Item>
                                );
                            })}
                        </ItemGroup>
                    )}
                </div>
            </div>
        </div>
    );

    const detailPane = (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="border-border flex min-h-14 shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-5">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="lg:hidden"
                    onClick={() => setMobilePane('list')}
                    aria-label={t.navRecommendations}
                >
                    <ArrowLeft className="size-4" />
                </Button>
                <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Sparkles className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tracking-tight">
                        {selected ? recommendationTitle(selected.title) : t.detailTitle}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                        {selected
                            ? `${categoryLabel(selected.category)} · ${severityLabel(selected.severity)}`
                            : t.selectRecommendation}
                    </p>
                </div>
                {statusControl}
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
                    {!selected ? (
                        <div className="text-muted-foreground flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
                            <Sparkles className="size-5 opacity-40" />
                            <p className="max-w-xs text-sm">{t.selectRecommendation}</p>
                        </div>
                    ) : (
                        <div className="mx-auto max-w-3xl">
                            <RecommendationDetailBody
                                item={selected}
                                locale={numberLocale}
                                labels={{
                                    confidence: t.confidence,
                                    impact: t.impact,
                                    evidence: t.evidence,
                                    potentialSaving: t.potentialSaving,
                                    resource: t.resourceLabel,
                                    resourceType: t.resourceTypeLabel,
                                    optimizationType: t.optimizationTypeLabel,
                                    openInFinops: t.openInFinops,
                                    openAccount: t.openAccountOptimize,
                                    openInGovernance: t.openInGovernance,
                                    noImpact: t.noImpact,
                                    category: categoryLabel(selected.category),
                                    severity: severityLabel(selected.severity),
                                    description: recommendationDescription(selected.description),
                                    sourceLabel: t.sourceLabel,
                                    sourceFinopsAnomaly: t.sourceFinopsAnomaly,
                                    sourceFinopsSaving: t.sourceFinopsSaving,
                                    sourceGovernance: t.sourceGovernance,
                                    sourceCorrelated: t.sourceCorrelated,
                                    rankingScore: t.rankingScore,
                                    correlatedBadge: t.correlatedBadge,
                                    formatResourceType: resourceTypeLabel,
                                    formatOptimizationType: finopsTypeLabel,
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {selected && detailFooter ? (
                <div className="border-border bg-background/95 shrink-0 border-t px-4 py-3 backdrop-blur-sm sm:px-5">
                    <div className="mx-auto max-w-3xl">{detailFooter}</div>
                </div>
            ) : null}
        </div>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <CiPageHeader title={t.recommendationsTitle} description={t.recommendationsDescription} />
            <div className="border-border bg-background flex min-h-[calc(100svh-14rem)] flex-1 flex-col overflow-hidden rounded-xl border">
                <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
                    {mobilePane === 'list' ? listPane : detailPane}
                </div>

                <div className="hidden h-full min-h-0 flex-1 overflow-hidden lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
                    <aside className="border-border bg-muted/15 flex h-full min-h-0 flex-col overflow-hidden border-r">
                        {listPane}
                    </aside>
                    <section className="bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                        {detailPane}
                    </section>
                </div>
            </div>
        </div>
    );
}

/** @deprecated Use CloudIntelligenceShell */
export function CloudIntelligenceRecommendationsPage() {
    return <CloudIntelligenceRecommendationsPanel />;
}
