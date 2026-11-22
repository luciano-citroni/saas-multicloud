import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ cloudAccountId: string; id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
    const { cloudAccountId, id } = await context.params;
    return proxyToBackend(
        request,
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/recommendations/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
    );
}
