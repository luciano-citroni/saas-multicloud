import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
    const { id } = await params;
    return proxyToBackend(request, `/api/ai-chat/conversations/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
    });
}
