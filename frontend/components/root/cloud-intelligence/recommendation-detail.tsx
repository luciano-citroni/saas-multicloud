'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { AiRecommendation } from '@/app/actions/cloud-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Labels = {
    confidence: string;
    impact: string;
    evidence: string;
    potentialSaving: string;
    resource: string;
    resourceType: string;
    optimizationType: string;
    openInFinops: string;
    openAccount: string;
    openInGovernance?: string;
    noImpact: string;
    category: string;
    severity: string;
    description: string;
    sourceLabel?: string;
    sourceFinopsAnomaly?: string;
    sourceFinopsSaving?: string;
    sourceGovernance?: string;
    sourceCorrelated?: string;
    rankingScore?: string;
    correlatedBadge?: string;
    formatResourceType?: (resourceType: string) => string;
    formatOptimizationType?: (type: string) => string;
};

function resolveSourceLabel(
    evidence: Record<string, unknown> | null,
    labels: Labels,
): string | null {
    if (!evidence) return null;
    const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
    if (sources.length > 1) {
        return labels.sourceCorrelated ?? labels.correlatedBadge ?? 'Correlated';
    }
    if (typeof evidence.findingId === 'string' || sources.some((s) => asRecord(s)?.type === 'governance_finding')) {
        return labels.sourceGovernance ?? 'Governance';
    }
    if (typeof evidence.anomalyId === 'string' || sources.some((s) => asRecord(s)?.type === 'finops_anomaly')) {
        return labels.sourceFinopsAnomaly ?? 'FinOps anomaly';
    }
    if (
        typeof evidence.finopsRecommendationId === 'string' ||
        sources.some((s) => asRecord(s)?.type === 'finops_saving')
    ) {
        return labels.sourceFinopsSaving ?? 'FinOps saving';
    }
    return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatMoney(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency || 'USD',
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount} ${currency}`;
    }
}

export function RecommendationDetailBody({
    item,
    labels,
    locale,
}: {
    item: AiRecommendation;
    labels: Labels;
    locale: string;
}) {
    const impact = asRecord(item.estimatedImpact);
    const evidence = asRecord(item.evidence);
    const resource = asRecord(item.resourceReference);
    const saving = asNumber(impact?.potentialSaving);
    const currency = asString(impact?.currency) ?? 'USD';
    const resourceId = asString(resource?.resourceId);
    const resourceType = asString(resource?.resourceType);
    const cloudAccountId = asString(resource?.cloudAccountId);
    const rawType = asString(evidence?.type);
    const typeLabel = rawType
        ? (labels.formatOptimizationType?.(rawType) ??
          asString(evidence?.typeLabel) ??
          rawType.replace(/[_-]+/g, ' '))
        : (asString(evidence?.typeLabel) ?? null);
    const finopsRecommendationId = asString(evidence?.finopsRecommendationId);
    const findingId = asString(evidence?.findingId);
    const rankingScore = asNumber(impact?.rankingScore);
    const sourceLabel = resolveSourceLabel(evidence, labels);
    const sources = Array.isArray(evidence?.sources) ? evidence!.sources : [];
    const correlated = sources.length > 1;
    const displayResourceType = resourceType
        ? (labels.formatResourceType?.(resourceType) ?? resourceType)
        : null;
    const hasEvidence = Boolean(typeLabel || displayResourceType || resourceId);
    const hasLinks = Boolean(cloudAccountId);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="h-6 px-2 text-xs">
                    {labels.category}
                </Badge>
                <Badge variant="outline" className="h-6 px-2 text-xs">
                    {labels.severity}
                </Badge>
                {sourceLabel ? (
                    <Badge variant="outline" className="h-6 px-2 text-xs">
                        {labels.sourceLabel ? `${labels.sourceLabel}: ${sourceLabel}` : sourceLabel}
                    </Badge>
                ) : null}
                {correlated && labels.correlatedBadge ? (
                    <Badge className="h-6 px-2 text-xs">{labels.correlatedBadge}</Badge>
                ) : null}
                {rankingScore != null && labels.rankingScore ? (
                    <Badge variant="secondary" className="h-6 px-2 text-xs tabular-nums">
                        {labels.rankingScore} {Math.round(rankingScore)}
                    </Badge>
                ) : null}
            </div>

            <p className="text-foreground/90 text-[15px] leading-relaxed whitespace-pre-wrap">
                {labels.description}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="bg-muted/40 rounded-xl border border-border/60 px-4 py-3">
                    <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                        {labels.confidence}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                        {Math.round((item.confidence ?? 0) * 100)}
                        <span className="text-muted-foreground ml-0.5 text-sm font-medium">%</span>
                    </p>
                </div>
                <div className="bg-muted/40 rounded-xl border border-border/60 px-4 py-3">
                    <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                        {labels.potentialSaving}
                    </p>
                    <p
                        className={cn(
                            'mt-1 text-2xl font-semibold tracking-tight tabular-nums',
                            saving != null && 'text-emerald-700 dark:text-emerald-300',
                        )}
                    >
                        {saving != null ? formatMoney(saving, currency, locale) : labels.noImpact}
                    </p>
                </div>
            </div>

            {hasEvidence || hasLinks ? (
                <div className="space-y-3 rounded-xl border border-border/60 p-4">
                    <p className="text-sm font-medium">{labels.evidence}</p>
                    {hasEvidence ? (
                        <dl className="grid gap-2.5 text-sm">
                            {typeLabel ? (
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <dt className="text-muted-foreground">{labels.optimizationType}</dt>
                                    <dd className="font-medium capitalize">{typeLabel}</dd>
                                </div>
                            ) : null}
                            {displayResourceType ? (
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <dt className="text-muted-foreground">{labels.resourceType}</dt>
                                    <dd className="font-medium">{displayResourceType}</dd>
                                </div>
                            ) : null}
                            {resourceId ? (
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <dt className="text-muted-foreground">{labels.resource}</dt>
                                    <dd className="bg-muted max-w-full rounded-md px-2 py-1 font-mono text-[11px] break-all">
                                        {resourceId}
                                    </dd>
                                </div>
                            ) : null}
                        </dl>
                    ) : null}

                    {hasLinks ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {cloudAccountId ? (
                                <Button size="sm" variant="outline" asChild>
                                    <Link href={`/finops/accounts/${cloudAccountId}?tab=optimize`}>
                                        {labels.openAccount}
                                        <ExternalLink className="size-3.5" />
                                    </Link>
                                </Button>
                            ) : null}
                            {finopsRecommendationId && cloudAccountId ? (
                                <Button size="sm" variant="ghost" asChild>
                                    <Link
                                        href={`/finops/accounts/${cloudAccountId}?tab=optimize&recommendationId=${encodeURIComponent(finopsRecommendationId)}`}
                                    >
                                        {labels.openInFinops}
                                    </Link>
                                </Button>
                            ) : null}
                            {findingId && cloudAccountId && labels.openInGovernance ? (
                                <Button size="sm" variant="ghost" asChild>
                                    <Link
                                        href={`/governance/analysis?cloudAccountId=${encodeURIComponent(cloudAccountId)}&findingId=${encodeURIComponent(findingId)}`}
                                    >
                                        {labels.openInGovernance}
                                        <ExternalLink className="size-3.5" />
                                    </Link>
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
