import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel') ?? 'email';
    const page = searchParams.get('page') ?? '1';
    const limit = searchParams.get('limit') ?? '10';
    const qs = new URLSearchParams({ channel, page, limit });
    return proxyToBackend(request, `/api/notifications/groups?${qs.toString()}`);
}

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/notifications/groups', { method: 'POST' });
}
