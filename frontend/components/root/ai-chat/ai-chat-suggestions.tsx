'use client';

import { Cloud, DollarSign, FileSearch, ShieldCheck, Workflow } from 'lucide-react';
import {
    Item,
    ItemContent,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
    {
        icon: DollarSign,
        key: 'waste',
        pt: 'Quanto estou desperdiçando e o que cortar esta semana?',
        en: 'How much am I wasting and what should I cut this week?',
    },
    {
        icon: ShieldCheck,
        key: 'critical',
        pt: 'Quais findings críticos têm remediação pronta?',
        en: 'Which critical findings have remediation ready?',
    },
    {
        icon: FileSearch,
        key: 'anomaly',
        pt: 'Explique a anomalia de custo mais recente e o que mudou',
        en: 'Explain the latest cost anomaly and what changed',
    },
    {
        icon: Cloud,
        key: 'inventory',
        pt: 'Quais recursos existem nas minhas contas cloud?',
        en: 'What resources exist in my cloud accounts?',
    },
    {
        icon: Workflow,
        key: 'automation',
        pt: 'Crie um rascunho de automação para a recomendação mais urgente',
        en: 'Draft an automation for the most urgent recommendation',
    },
] as const;

type Props = {
    locale: 'pt' | 'en';
    title: string;
    onSelect: (prompt: string) => void;
    disabled?: boolean;
};

export function AiChatSuggestions({ locale, title, onSelect, disabled }: Props) {
    return (
        <div className="mt-2 w-full max-w-2xl space-y-3">
            <p className="text-muted-foreground text-center text-[11px] font-medium tracking-wide uppercase">
                {title}
            </p>
            <ItemGroup className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((item) => {
                    const Icon = item.icon;
                    const prompt = locale === 'en' ? item.en : item.pt;
                    return (
                        <Item
                            key={item.key}
                            role="listitem"
                            tabIndex={disabled ? -1 : 0}
                            size="sm"
                            variant="outline"
                            aria-disabled={disabled || undefined}
                            className={cn(
                                'cursor-pointer hover:bg-muted/50',
                                disabled && 'pointer-events-none opacity-60',
                            )}
                            onClick={() => {
                                if (!disabled) onSelect(prompt);
                            }}
                            onKeyDown={(event) => {
                                if (disabled) return;
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onSelect(prompt);
                                }
                            }}
                        >
                            <ItemMedia
                                variant="icon"
                                className="bg-muted text-muted-foreground size-7 rounded-md"
                            >
                                <Icon className="size-3.5" />
                            </ItemMedia>
                            <ItemContent className="min-w-0">
                                <ItemTitle className="line-clamp-3 w-full max-w-none text-xs font-normal whitespace-normal">
                                    {prompt}
                                </ItemTitle>
                            </ItemContent>
                        </Item>
                    );
                })}
            </ItemGroup>
        </div>
    );
}
