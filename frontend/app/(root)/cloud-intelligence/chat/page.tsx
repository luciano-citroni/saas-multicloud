import { Suspense } from 'react';
import { CiChatRoutePage } from '@/components/root/cloud-intelligence/ci-chat-page';

export default function CloudIntelligenceChatRoute() {
    return (
        <Suspense fallback={<div className="text-muted-foreground text-sm">Loading…</div>}>
            <CiChatRoutePage />
        </Suspense>
    );
}
