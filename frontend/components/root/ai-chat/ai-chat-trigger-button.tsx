'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import { notifyAiChatOpen } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';

type Props = {
    variant?: 'header' | 'fab';
    className?: string;
};

export function AiChatTriggerButton({ variant = 'header', className }: Props) {
    const t = useTranslations('aiChat');

    if (variant === 'fab') {
        return (
            <Button
                type="button"
                size="lg"
                className={cn(
                    'fixed right-4 bottom-4 z-[100] h-12 gap-2 rounded-full px-4 shadow-lg md:right-6 md:bottom-6',
                    className,
                )}
                onClick={() => notifyAiChatOpen()}
                aria-label={t.open}
            >
                <MessageCircle className="size-5" />
                <span className="font-medium">{t.openShort}</span>
            </Button>
        );
    }

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('ml-auto gap-1.5', className)}
            onClick={() => notifyAiChatOpen()}
            aria-label={t.open}
        >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">{t.openShort}</span>
        </Button>
    );
}
