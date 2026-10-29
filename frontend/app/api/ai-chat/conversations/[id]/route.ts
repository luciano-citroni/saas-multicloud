import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
    const { id } = await params;
    return proxyToBackend(request, `/api/ai-chat/conversations/${encodeURIComponent(id)}`);
}

export async function DELETE(request: Request, { params }: Params) {
    const { id } = await params;
    return proxyToBackend(request, `/api/ai-chat/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}
