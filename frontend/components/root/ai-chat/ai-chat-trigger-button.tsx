'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import { notifyAiChatOpen } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';

type Props = {
    variant?: 'header' | 'fab';
    className?: string;
    onClick?: () => void;
};

export function AiChatTriggerButton({ variant = 'header', className, onClick }: Props) {
    const t = useTranslations('aiChat');

    const handleClick = () => {
        onClick?.();
        if (!onClick) {
            notifyAiChatOpen();
        }
    };

    if (variant === 'fab') {
        return (
            <Button
                type="button"
                size="lg"
                className={cn(
                    'fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] size-12 rounded-full p-0 shadow-lg sm:right-6 sm:bottom-6 sm:h-12 sm:w-auto sm:gap-2 sm:px-4',
                    className,
                )}
                aria-label={t.open}
                onClick={handleClick}
            >
                <MessageCircle className="size-5" />
                <span className="hidden font-medium sm:inline">{t.openShort}</span>
            </Button>
        );
    }

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('ml-auto gap-1.5', className)}
            aria-label={t.open}
            onClick={handleClick}
        >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">{t.openShort}</span>
        </Button>
    );
}
