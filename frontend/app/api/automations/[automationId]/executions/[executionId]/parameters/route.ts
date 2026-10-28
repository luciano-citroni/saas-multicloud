import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ automationId: string; executionId: string }> };

export async function GET(request: Request, context: RouteContext) {
    const { automationId, executionId } = await context.params;
    return proxyToBackend(request, `/api/automations/${automationId}/executions/${executionId}/parameters`);
}
