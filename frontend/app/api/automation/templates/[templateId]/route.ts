import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ templateId: string }> };

export async function GET(request: Request, context: RouteContext) {
    const { templateId } = await context.params;
    return proxyToBackend(request, `/api/automation/templates/${templateId}`);
}
