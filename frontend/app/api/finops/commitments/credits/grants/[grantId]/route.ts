import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ grantId: string }> };

export async function PATCH(request: Request, { params }: Params) {
    const { grantId } = await params;
    return proxyToBackend(request, `/api/finops/commitments/credits/grants/${encodeURIComponent(grantId)}`, {
        method: 'PATCH',
    });
}

export async function DELETE(request: Request, { params }: Params) {
    const { grantId } = await params;
    return proxyToBackend(request, `/api/finops/commitments/credits/grants/${encodeURIComponent(grantId)}`, {
        method: 'DELETE',
    });
}
