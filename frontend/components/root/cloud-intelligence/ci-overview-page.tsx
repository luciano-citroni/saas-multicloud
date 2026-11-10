'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleAlert, MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
    fetchCloudIntelligenceDailyReports,
    fetchCloudIntelligenceDashboard,
    generateCloudIntelligenceDailyReport,
    type AiDailyReport,
    type AiDashboard,
} from '@/app/actions/cloud-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';
import { CiPageHeader } from './ci-page-header';
import { useCiLabels } from './ci-labels';

type BriefingAction = {
    title?: string;
    why?: string;
    impact?: string;
    nextStep?: string;
    recommendationId?: string;
    rankingScore?: number;
};

function unwrapReports(body: unknown): AiDailyReport[] {
    if (Array.isArray(body)) return body as AiDailyReport[];
    if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
        return (body as { items: AiDailyReport[] }).items;
    }
    return [];
}

export function CiOverviewPage() {
    const t = useTranslations('cloudIntelligence');
    const { severityLabel } = useCiLabels();
    const [pending, startTransition] = useTransition();
    const [generating, setGenerating] = useState(false);
    const [dashboard, setDashboard] = useState<AiDashboard | null>(null);
    const [latestReport, setLatestReport] = useState<AiDailyReport | null>(null);
    const [loaded, setLoaded] = useState(false);

    const briefing = useMemo(() => {
        const raw = latestReport?.findings?.briefing;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const record = raw as { headline?: string; actions?: BriefingAction[] };
        return {
            headline: typeof record.headline === 'string' ? record.headline : null,
            actions: Array.isArray(record.actions) ? record.actions : [],
        };
    }, [latestReport]);

    const load = () => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId) {
            setDashboard(null);
            setLatestReport(null);
            setLoaded(true);
            return;
        }
        startTransition(async () => {
            const [dashRes, reportsRes] = await Promise.all([
                fetchCloudIntelligenceDashboard(organizationId),
                fetchCloudIntelligenceDailyReports(organizationId),
            ]);
            if (dashRes.ok) {
                setDashboard((await dashRes.json()) as AiDashboard);
            } else {
                setDashboard(null);
            }
            if (reportsRes.ok) {
                const reports = unwrapReports(await reportsRes.json());
                setLatestReport(reports[0] ?? null);
            } else {
                setLatestReport(null);
            }
            setLoaded(true);
        });
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const generateAnalysis = async () => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId) return;
        setGenerating(true);
        try {
            const res = await generateCloudIntelligenceDailyReport(organizationId);
            if (!res.ok) {
                toast.error(extractErrorMessage(await res.json().catch(() => ({}))));
                return;
            }
            toast.success(t.generateAnalysisSuccess);
            load();
        } finally {
            setGenerating(false);
        }
    };

    const kpis = [
        {
            label: t.pendingRecommendations,
            value: dashboard?.pendingRecommendations ?? 0,
            hint: t.pendingHint,
        },
        {
            label: t.openFindings,
            value: dashboard?.openFindings ?? 0,
            hint: t.sourceGovernance,
        },
        {
            label: t.potentialSaving,
            value:
                dashboard?.potentialSaving != null
                    ? new Intl.NumberFormat(undefined, {
                          style: 'currency',
                          currency: 'USD',
                          maximumFractionDigits: 0,
                      }).format(dashboard.potentialSaving)
                    : '—',
            hint: t.sourceFinopsSaving,
        },
        {
            label: t.score,
            value: dashboard?.score ?? '—',
            hint: t.tier,
        },
    ];

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <CiPageHeader
                title={t.title}
                description={t.description}
                actions={
                    <Button
                        type="button"
                        className="gap-2"
                        disabled={generating}
                        onClick={() => void generateAnalysis()}
                    >
                        <RefreshCw className={cn('size-4', generating && 'animate-spin')} />
                        {t.generateAnalysis}
                    </Button>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {kpis.map((kpi) => (
                    <div
                        key={kpi.label}
                        className="bg-muted/30 rounded-xl border border-border/60 px-4 py-3"
                    >
                        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                            {kpi.label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                            {!loaded || pending ? '…' : kpi.value}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">{kpi.hint}</p>
                    </div>
                ))}
            </div>

            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                <section className="border-border bg-background flex min-h-0 flex-col overflow-hidden rounded-xl border">
                    <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
                        <div>
                            <h2 className="text-sm font-semibold tracking-tight">{t.todaysActions}</h2>
                            <p className="text-muted-foreground text-xs">
                                {latestReport?.reportDate
                                    ? t.latestDaily
                                    : t.todaysActionsEmpty}
                            </p>
                        </div>
                        <Badge variant="outline" className="h-6 px-2 text-[11px]">
                            {briefing?.actions?.length ?? 0}
                        </Badge>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {!loaded || pending ? (
                            <p className="text-muted-foreground text-sm">{t.loading}</p>
                        ) : briefing?.actions?.length ? (
                            <div className="space-y-3">
                                {briefing.headline ? (
                                    <p className="text-sm leading-relaxed">{briefing.headline}</p>
                                ) : null}
                                <ol className="space-y-2">
                                    {briefing.actions.slice(0, 5).map((action, index) => {
                                        const href = action.recommendationId
                                            ? `/cloud-intelligence/recommendations?id=${encodeURIComponent(action.recommendationId)}`
                                            : '/cloud-intelligence/recommendations';
                                        return (
                                            <li key={`${action.recommendationId ?? action.title}-${index}`}>
                                                <Link
                                                    href={href}
                                                    className="hover:bg-muted/50 group block rounded-lg border border-border/60 px-3 py-2.5 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 space-y-1">
                                                            <p className="text-sm font-medium">
                                                                {index + 1}. {action.title}
                                                            </p>
                                                            {action.why ? (
                                                                <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                                                                    {action.why}
                                                                </p>
                                                            ) : null}
                                                            {action.impact ? (
                                                                <p className="text-xs tabular-nums">
                                                                    {action.impact}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                        <ArrowRight className="text-muted-foreground group-hover:text-foreground mt-0.5 size-4 shrink-0 transition-colors" />
                                                    </div>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                                <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
                                    <CircleAlert className="size-5" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">{t.todaysActionsEmpty}</p>
                                    <p className="text-muted-foreground max-w-sm text-xs leading-relaxed">
                                        {t.generateAnalysisHint}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <aside className="flex flex-col gap-3">
                    <div className="rounded-xl border border-border/60 p-4">
                        <p className="text-sm font-semibold tracking-tight">{t.recommendationsTitle}</p>
                        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                            {t.recommendationsDescription}
                        </p>
                        <Button asChild size="sm" className="mt-3 w-full justify-start gap-2">
                            <Link href="/cloud-intelligence/recommendations">
                                <Sparkles className="size-3.5" />
                                {t.viewAllRecommendations}
                            </Link>
                        </Button>
                    </div>

                    <div className="rounded-xl border border-border/60 p-4">
                        <p className="text-sm font-semibold tracking-tight">{t.navChat}</p>
                        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                            {t.chatDescription}
                        </p>
                        <Button asChild size="sm" variant="outline" className="mt-3 w-full justify-start gap-2">
                            <Link href="/cloud-intelligence/chat">
                                <MessageSquare className="size-3.5" />
                                {t.openChat}
                            </Link>
                        </Button>
                    </div>

                    <div className="rounded-xl border border-border/60 p-4">
                        <p className="text-sm font-semibold tracking-tight">{t.howItWorksTitle}</p>
                        <ol className="text-muted-foreground mt-2 space-y-2 text-xs leading-relaxed">
                            <li>
                                <span className="text-foreground font-medium">{t.howStepDailyTitle}</span>
                                {' — '}
                                {t.howStepDailyDesc}
                            </li>
                            <li>
                                <span className="text-foreground font-medium">{t.howStepRecsTitle}</span>
                                {' — '}
                                {t.howStepRecsDesc}
                            </li>
                            <li>
                                <span className="text-foreground font-medium">{t.howStepActionTitle}</span>
                                {' — '}
                                {t.howStepActionDesc}
                            </li>
                        </ol>
                    </div>

                    {dashboard?.recommendations?.length ? (
                        <div className="rounded-xl border border-border/60 p-4">
                            <p className="text-sm font-semibold tracking-tight">
                                {t.pendingOptimizations}
                            </p>
                            <ul className="mt-2 space-y-2">
                                {dashboard.recommendations.slice(0, 4).map((item) => (
                                    <li key={item.id}>
                                        <Link
                                            href={`/cloud-intelligence/recommendations?id=${encodeURIComponent(item.id)}`}
                                            className="hover:bg-muted/50 block rounded-md px-2 py-1.5 transition-colors"
                                        >
                                            <p className="line-clamp-1 text-xs font-medium">
                                                {item.title}
                                            </p>
                                            <p className="text-muted-foreground text-[11px]">
                                                {severityLabel(item.severity)} · {item.status}
                                            </p>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}
