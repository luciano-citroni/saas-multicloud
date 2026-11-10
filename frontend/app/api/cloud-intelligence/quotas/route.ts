import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/cloud-intelligence/quotas');
}

export async function PATCH(request: Request) {
    return proxyToBackend(request, '/api/cloud-intelligence/quotas', { method: 'PATCH' });
}
