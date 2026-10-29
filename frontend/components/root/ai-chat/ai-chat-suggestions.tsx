'use client';

import { Cloud, DollarSign, FileSearch, ShieldCheck, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SUGGESTIONS = [
    {
        icon: DollarSign,
        key: 'costs',
        pt: 'Qual foi o custo total no último mês?',
        en: 'What was the total cost last month?',
    },
    {
        icon: Cloud,
        key: 'inventory',
        pt: 'Quais recursos existem nas minhas contas cloud?',
        en: 'What resources exist in my cloud accounts?',
    },
    {
        icon: ShieldCheck,
        key: 'governance',
        pt: 'Quais findings de governança estão abertos?',
        en: 'Which governance findings are open?',
    },
    {
        icon: FileSearch,
        key: 'assessment',
        pt: 'Como está o último assessment?',
        en: 'How is the latest assessment?',
    },
    {
        icon: Workflow,
        key: 'automation',
        pt: 'Quais automações falharam recentemente?',
        en: 'Which automations failed recently?',
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
        <div className="mt-4 w-full max-w-sm space-y-2">
            <p className="text-muted-foreground text-center text-[11px] font-medium tracking-wide uppercase">
                {title}
            </p>
            <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((item) => {
                    const Icon = item.icon;
                    const prompt = locale === 'en' ? item.en : item.pt;
                    return (
                        <Button
                            key={item.key}
                            type="button"
                            variant="outline"
                            disabled={disabled}
                            className="h-auto justify-start gap-2 px-3 py-2 text-left text-xs font-normal whitespace-normal"
                            onClick={() => onSelect(prompt)}
                        >
                            <Icon className="text-muted-foreground size-3.5 shrink-0" />
                            <span>{prompt}</span>
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
