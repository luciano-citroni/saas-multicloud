import { AutomationExecutionDetailClient } from '@/components/root/automations/automation-execution-detail-client';

type PageProps = { params: Promise<{ automationId: string; executionId: string }> };

export default async function AutomationExecutionPage({ params }: PageProps) {
    const { automationId, executionId } = await params;
    return <AutomationExecutionDetailClient automationId={automationId} executionId={executionId} />;
}
