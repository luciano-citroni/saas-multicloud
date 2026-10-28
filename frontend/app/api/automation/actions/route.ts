import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const qs = new URLSearchParams();
    if (provider) qs.set('provider', provider);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return proxyToBackend(request, `/api/automation/actions${suffix}`);
}
