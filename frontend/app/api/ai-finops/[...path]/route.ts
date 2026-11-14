import { proxyToBackend } from '@/lib/api/proxy-request';

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: RouteContext, method?: string) {
    const { path } = await context.params;
    const backendPath = `/api/ai-finops/${path.map(encodeURIComponent).join('/')}`;
    return proxyToBackend(request, backendPath, method ? { method } : undefined);
}

export async function GET(request: Request, context: RouteContext) {
    return forward(request, context, 'GET');
}

export async function POST(request: Request, context: RouteContext) {
    return forward(request, context, 'POST');
}

export async function PATCH(request: Request, context: RouteContext) {
    return forward(request, context, 'PATCH');
}

export async function PUT(request: Request, context: RouteContext) {
    return forward(request, context, 'PUT');
}

export async function DELETE(request: Request, context: RouteContext) {
    return forward(request, context, 'DELETE');
}
