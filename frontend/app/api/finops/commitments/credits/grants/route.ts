import { proxyToBackend } from '@/lib/api/proxy-request';

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/finops/commitments/credits/grants', { method: 'POST' });
}
