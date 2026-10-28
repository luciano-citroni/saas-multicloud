import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/automation/templates');
}

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/automation/templates', { method: 'POST' });
}
