import { proxyToBackend } from '@/lib/api/proxy-request';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
    const { id } = await params;
    return proxyToBackend(request, `/api/notifications/emails/${encodeURIComponent(id)}`, {
        method: 'PUT',
    });
}

export async function DELETE(request: Request, { params }: Params) {
    const { id } = await params;
    return proxyToBackend(request, `/api/notifications/emails/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}
