'use client';

import { AiChatPage } from '@/components/root/ai-chat/ai-chat-page';
import { useTranslations } from '@/lib/i18n';
import { CiPageHeader } from './ci-page-header';

export function CiChatRoutePage() {
    const t = useTranslations('cloudIntelligence');

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <CiPageHeader title={t.navChat} description={t.chatDescription} />
            <div className="border-border bg-background min-h-[calc(100svh-14rem)] flex-1 overflow-hidden rounded-xl border">
                <AiChatPage embedded />
            </div>
        </div>
    );
}
