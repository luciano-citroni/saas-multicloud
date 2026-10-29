import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ budgetId: string }> };

export async function PUT(request: Request, { params }: Params) {
    const { budgetId } = await params;
    return proxyToBackend(request, `/api/finops/budgets/${encodeURIComponent(budgetId)}`, {
        method: 'PUT',
    });
}

export async function DELETE(request: Request, { params }: Params) {
    const { budgetId } = await params;
    return proxyToBackend(request, `/api/finops/budgets/${encodeURIComponent(budgetId)}`, {
        method: 'DELETE',
    });
}
