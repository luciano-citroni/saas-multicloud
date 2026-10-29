import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    // Avoid /budgets/organization/status — conflicts with /budgets/[budgetId] in Next.js.
    const onlyOrganization = searchParams.get('onlyOrganization') === 'true';
    const backendPath = onlyOrganization
        ? '/api/finops/budgets/organization/status'
        : '/api/finops/budgets/status';

    return proxyToBackend(request, backendPath);
}
