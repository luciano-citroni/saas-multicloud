import { Suspense } from 'react';
import { AutomationsListClient } from '@/components/root/automations/automations-list-client';

export default function AutomationsPage() {
    return (
        <div className="p-6">
            <Suspense fallback={null}>
                <AutomationsListClient />
            </Suspense>
        </div>
    );
}
