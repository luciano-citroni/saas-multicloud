'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleClick = () => {
        onClick?.();
        if (!onClick) {
            notifyAiChatOpen();
        }
    };

    if (variant === 'fab') {
        const fab = (
            <Button
                type="button"
                size="lg"
                className={cn(
                    'fixed top-auto right-4 bottom-4 z-[100] size-12 rounded-full p-0 shadow-lg',
                    'sm:right-6 sm:bottom-6 sm:h-12 sm:w-auto sm:gap-2 sm:px-4',
                    className,
                )}
                aria-label={t.open}
                onClick={handleClick}
            >
                <MessageCircle className="size-5" />
                <span className="hidden font-medium sm:inline">{t.openShort}</span>
            </Button>
        );

        // Portal avoids flex/transform ancestors in the authenticated shell
        // stealing the fixed containing block and pinning the FAB to the top.
        if (!mounted) return null;
        return createPortal(fab, document.body);
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
