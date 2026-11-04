import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/finops/anomaly-alerts/settings');
}

export async function PUT(request: Request) {
    return proxyToBackend(request, '/api/finops/anomaly-alerts/settings', { method: 'PUT' });
}
