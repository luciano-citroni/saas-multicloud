import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/ai-chat/conversations');
}

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/ai-chat/conversations', { method: 'POST' });
}
