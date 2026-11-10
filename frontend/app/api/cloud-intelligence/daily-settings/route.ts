import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/cloud-intelligence/daily-settings');
}

export async function PATCH(request: Request) {
    return proxyToBackend(request, '/api/cloud-intelligence/daily-settings', { method: 'PATCH' });
}
