import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ automationId: string }> };

export async function GET(request: Request, context: RouteContext) {
    const { automationId } = await context.params;
    return proxyToBackend(request, `/api/automations/${automationId}`);
}

export async function PUT(request: Request, context: RouteContext) {
    const { automationId } = await context.params;
    return proxyToBackend(request, `/api/automations/${automationId}`, { method: 'PUT' });
}

export async function DELETE(request: Request, context: RouteContext) {
    const { automationId } = await context.params;
    return proxyToBackend(request, `/api/automations/${automationId}`, { method: 'DELETE' });
}
