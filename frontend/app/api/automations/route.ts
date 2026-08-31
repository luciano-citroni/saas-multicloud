import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/automations');
}

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/automations', { method: 'POST' });
}
