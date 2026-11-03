import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/notifications/groups');
}

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/notifications/groups', { method: 'POST' });
}
