import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
    const { id } = await context.params;
    return proxyToBackend(
        request,
        `/api/cloud-intelligence/knowledge/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
    );
}
