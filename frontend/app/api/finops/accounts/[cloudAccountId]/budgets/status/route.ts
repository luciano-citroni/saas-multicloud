import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ cloudAccountId: string }> };

export async function GET(request: Request, { params }: Params) {
    const { cloudAccountId } = await params;
    return proxyToBackend(
        request,
        `/api/finops/accounts/${encodeURIComponent(cloudAccountId)}/budgets/status`
    );
}
