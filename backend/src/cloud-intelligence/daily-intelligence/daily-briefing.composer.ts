import { Injectable, Logger } from '@nestjs/common';
import { AiProviderFactory } from '../providers/ai-provider.factory';
import {
    DAILY_BRIEFING_TOP,
    type RankedDailySignal,
} from './daily-signal.aggregator';

export type DailyBriefingAction = {
    title: string;
    why: string;
    impact: string;
    nextStep: string;
    recommendationId?: string;
    rankingScore: number;
    dedupeKey: string;
};

export type DailyBriefing = {
    headline: string;
    actions: DailyBriefingAction[];
    llmUsed: boolean;
};

function templateBriefing(
    signals: RankedDailySignal[],
    counts: { anomalies: number; findings: number; savings: number },
): DailyBriefing {
    const top = signals.slice(0, DAILY_BRIEFING_TOP);
    return {
        headline: `Top ${top.length} ações priorizadas hoje (${counts.anomalies} anomalias, ${counts.findings} findings, ${counts.savings} economias).`,
        actions: top.map((signal) => ({
            title: signal.title,
            why: signal.sources.length > 1
                ? 'Sinal correlacionado entre FinOps e Governança no mesmo recurso.'
                : 'Priorizado por severidade, impacto financeiro e recência.',
            impact:
                signal.estimatedImpact.potentialSaving != null
                    ? `Score ${signal.rankingScore} · ~${signal.estimatedImpact.potentialSaving} ${signal.estimatedImpact.currency}`
                    : `Score ${signal.rankingScore}`,
            nextStep: signal.automatable
                ? 'Revisar e preparar automação na fila de recomendações.'
                : 'Investigar na fonte (FinOps ou Governança) e atualizar o status.',
            rankingScore: signal.rankingScore,
            dedupeKey: signal.dedupeKey,
        })),
        llmUsed: false,
    };
}

@Injectable()
export class DailyBriefingComposer {
    private readonly logger = new Logger(DailyBriefingComposer.name);

    constructor(private readonly providerFactory: AiProviderFactory) {}

    async compose(input: {
        signals: RankedDailySignal[];
        recommendationIdsByDedupe: Map<string, string>;
        counts: { anomalies: number; findings: number; savings: number };
        locale?: 'pt' | 'en';
    }): Promise<DailyBriefing> {
        const fallback = templateBriefing(input.signals, input.counts);
        for (const action of fallback.actions) {
            action.recommendationId = input.recommendationIdsByDedupe.get(action.dedupeKey);
        }

        if (!this.providerFactory.isEnabled()) {
            return fallback;
        }

        try {
            const provider = this.providerFactory.getProvider();
            if (!provider.isConfigured()) {
                return fallback;
            }

            const top = input.signals.slice(0, DAILY_BRIEFING_TOP).map((signal) => ({
                title: signal.title,
                score: signal.rankingScore,
                category: signal.category,
                automatable: signal.automatable,
                sources: signal.sources,
                impact: signal.estimatedImpact,
                dedupeKey: signal.dedupeKey,
            }));

            const locale = input.locale ?? 'pt';
            const result = await provider.complete({
                messages: [
                    {
                        role: 'system',
                        content:
                            locale === 'en'
                                ? 'You write a short daily cloud ops briefing. Reply ONLY with JSON: {"headline":string,"actions":[{"dedupeKey":string,"title":string,"why":string,"impact":string,"nextStep":string}]}. Do not invent resources. Use only provided signals.'
                                : 'Você escreve um briefing diário curto de cloud ops. Responda APENAS com JSON: {"headline":string,"actions":[{"dedupeKey":string,"title":string,"why":string,"impact":string,"nextStep":string}]}. Não invente recursos. Use apenas os sinais fornecidos.',
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            counts: input.counts,
                            signals: top,
                        }),
                    },
                ],
                maxTokens: 800,
            });

            const raw = result.content?.trim();
            if (!raw) return fallback;

            const parsed = JSON.parse(extractJson(raw)) as {
                headline?: string;
                actions?: Array<{
                    dedupeKey?: string;
                    title?: string;
                    why?: string;
                    impact?: string;
                    nextStep?: string;
                }>;
            };

            const actions: DailyBriefingAction[] = (parsed.actions ?? [])
                .map((action) => {
                    const dedupeKey = String(action.dedupeKey ?? '');
                    const signal = input.signals.find((s) => s.dedupeKey === dedupeKey);
                    if (!signal) return null;
                    return {
                        title: String(action.title || signal.title).slice(0, 200),
                        why: String(action.why || fallback.actions[0]?.why || '').slice(0, 400),
                        impact: String(action.impact || `Score ${signal.rankingScore}`).slice(0, 200),
                        nextStep: String(action.nextStep || '').slice(0, 300),
                        rankingScore: signal.rankingScore,
                        dedupeKey,
                        recommendationId: input.recommendationIdsByDedupe.get(dedupeKey),
                    } satisfies DailyBriefingAction;
                })
                .filter((item): item is DailyBriefingAction => Boolean(item));

            if (!actions.length) {
                return fallback;
            }

            return {
                headline: String(parsed.headline || fallback.headline).slice(0, 300),
                actions,
                llmUsed: true,
            };
        } catch (error) {
            this.logger.warn(
                `daily.briefing.llm_failed ${error instanceof Error ? error.message : 'unknown'}`,
            );
            return fallback;
        }
    }
}

function extractJson(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return raw.slice(start, end + 1);
    return raw;
}
