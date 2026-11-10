'use client';

import { useEffect, useState } from 'react';
import { BrainCircuit, Sparkles } from 'lucide-react';
import {
    fetchCloudIntelligenceQuotas,
    fetchCloudIntelligenceRoi,
    type AiQuotaSnapshot,
    type AiRoiSnapshot,
} from '@/app/actions/cloud-intelligence';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n';
import { PlanModule, hasModuleAccess } from '@/lib/modules';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { UsageMeter } from './usage-meter';

function formatTokens(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function AiUsageSection({
    planModules,
    planAiTier,
}: {
    planModules: string[];
    planAiTier?: string | null;
}) {
    const t = useTranslations('billing');
    const ciT = useTranslations('cloudIntelligence');
    const hasCi = hasModuleAccess(planModules, PlanModule.CLOUD_INTELLIGENCE);
    const [loading, setLoading] = useState(hasCi);
    const [quotas, setQuotas] = useState<AiQuotaSnapshot | null>(null);
    const [roi, setRoi] = useState<AiRoiSnapshot | null>(null);

    const modulesKey = planModules.join(',');

    useEffect(() => {
        if (!hasCi) {
            setQuotas(null);
            setLoading(false);
            return;
        }

        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);

        void (async () => {
            try {
                const [res, roiRes] = await Promise.all([
                    fetchCloudIntelligenceQuotas(organizationId),
                    fetchCloudIntelligenceRoi(organizationId),
                ]);
                if (!res.ok) {
                    if (!cancelled) setQuotas(null);
                    return;
                }
                const payload = (await res.json()) as AiQuotaSnapshot;
                if (!cancelled) setQuotas(payload);
                if (roiRes.ok) {
                    const roiPayload = (await roiRes.json()) as { latest?: AiRoiSnapshot | null };
                    if (!cancelled) setRoi(roiPayload.latest ?? null);
                }
            } catch {
                if (!cancelled) {
                    setQuotas(null);
                    setRoi(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [hasCi, modulesKey]);

    if (!hasCi && !planAiTier) {
        return null;
    }

    const tier = quotas?.tier?.trim() || planAiTier?.trim() || null;
    const capabilities = quotas?.capabilities?.filter(Boolean) ?? [];

    return (
        <Card size="sm" className="border-border/70 shadow-xs">
            <CardHeader>
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                            <BrainCircuit className="size-4" />
                            {t.aiUsageTitle}
                        </CardTitle>
                        <CardDescription>{t.aiUsageDesc}</CardDescription>
                    </div>
                    {tier ? (
                        <Badge className="shrink-0 gap-1 uppercase">
                            <Sparkles className="size-3" />
                            {t.aiTier}: {tier}
                        </Badge>
                    ) : null}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="grid gap-3 md:grid-cols-2">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-28 w-full" />
                    </div>
                ) : !hasCi ? (
                    <p className="text-muted-foreground text-sm">{t.aiModuleDisabled}</p>
                ) : !quotas ? (
                    <p className="text-muted-foreground text-sm">{t.aiNoUsageData}</p>
                ) : (
                    <>
                        {capabilities.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-muted-foreground text-xs font-medium">
                                    {t.aiCapabilities}
                                </p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {capabilities.map((capability) => (
                                        <li key={capability}>
                                            <Badge variant="outline" className="font-normal capitalize">
                                                {capability.replaceAll('_', ' ')}
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        {roi ? (
                            <div className="bg-muted/40 space-y-1 rounded-lg border border-border/60 px-3 py-2.5">
                                <p className="text-xs font-medium">{ciT.roiTitle}</p>
                                <p className="text-muted-foreground text-[11px]">
                                    {ciT.roiPotential}: {Number(roi.potentialSaving).toFixed(2)}{' '}
                                    {roi.currency}
                                </p>
                                <p className="text-muted-foreground text-[11px]">
                                    {ciT.roiCompleted}: {Number(roi.completedSaving).toFixed(2)}{' '}
                                    {roi.currency}
                                </p>
                            </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-2">
                            <UsageMeter
                                label={t.aiDailyUsage}
                                used={quotas.dailyUsed}
                                limit={quotas.dailyLimit}
                                unlimitedLabel={t.aiUnlimited}
                                usedOfLabel={(used, limit) =>
                                    t.aiUsedOf.replace('{used}', used).replace('{limit}', limit)
                                }
                                remainingLabel={(remaining) =>
                                    t.aiRemaining.replace('{count}', remaining)
                                }
                                percentLabel={(percent) => t.aiPercentUsed.replace('{percent}', percent)}
                                nearLabel={t.aiNearLimit}
                                atLimitLabel={t.aiAtLimit}
                                formatValue={formatTokens}
                            />
                            <UsageMeter
                                label={t.aiMonthlyUsage}
                                used={quotas.monthlyUsed}
                                limit={quotas.monthlyLimit}
                                unlimitedLabel={t.aiUnlimited}
                                usedOfLabel={(used, limit) =>
                                    t.aiUsedOf.replace('{used}', used).replace('{limit}', limit)
                                }
                                remainingLabel={(remaining) =>
                                    t.aiRemaining.replace('{count}', remaining)
                                }
                                percentLabel={(percent) => t.aiPercentUsed.replace('{percent}', percent)}
                                nearLabel={t.aiNearLimit}
                                atLimitLabel={t.aiAtLimit}
                                formatValue={formatTokens}
                            />
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
