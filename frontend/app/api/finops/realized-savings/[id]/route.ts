import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
    const { id } = await context.params;
    return proxyToBackend(request, `/api/finops/realized-savings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
    });
}

export async function DELETE(request: Request, context: RouteContext) {
    const { id } = await context.params;
    return proxyToBackend(request, `/api/finops/realized-savings/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}
