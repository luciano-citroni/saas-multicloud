import { AutomationDetailClient } from '@/components/root/automations/automation-detail-client';

type PageProps = { params: Promise<{ automationId: string }> };

export default async function AutomationDetailPage({ params }: PageProps) {
    const { automationId } = await params;
    return <AutomationDetailClient automationId={automationId} />;
}
