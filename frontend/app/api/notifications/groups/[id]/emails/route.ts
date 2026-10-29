import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
    const { id } = await params;
    return proxyToBackend(request, `/api/notifications/groups/${encodeURIComponent(id)}/emails`, {
        method: 'POST',
    });
}
