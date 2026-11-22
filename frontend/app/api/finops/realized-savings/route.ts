import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    return proxyToBackend(request, '/api/finops/realized-savings');
}

export async function POST(request: Request) {
    return proxyToBackend(request, '/api/finops/realized-savings', { method: 'POST' });
}
