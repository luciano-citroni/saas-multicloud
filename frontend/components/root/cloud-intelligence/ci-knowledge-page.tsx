'use client';

import { useTranslations } from '@/lib/i18n';
import { CiKnowledgePanel } from './ci-knowledge-panel';
import { CiPageHeader } from './ci-page-header';

export function CiKnowledgePage() {
    const t = useTranslations('cloudIntelligence');

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
            <CiPageHeader title={t.knowledgeTitle} description={t.knowledgePageDesc} />
            <CiKnowledgePanel />
        </div>
    );
}
