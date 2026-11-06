import { proxyToBackend } from '@/lib/api/proxy-request';

export async function PUT(request: Request) {
    return proxyToBackend(request, '/api/finops/commercial-report/delivery', { method: 'PUT' });
}
