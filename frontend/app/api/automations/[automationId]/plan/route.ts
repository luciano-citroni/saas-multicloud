import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ automationId: string }> };

export async function POST(request: Request, context: RouteContext) {
    const { automationId } = await context.params;
    return proxyToBackend(request, `/api/automations/${automationId}/plan`, { method: 'POST' });
}
