import { proxyToBackend } from '@/lib/api/proxy-request';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cloudAccountId = searchParams.get('cloudAccountId') ?? '';
    const region = searchParams.get('region') ?? '';
    const resourceType = searchParams.get('resourceType') ?? '';
    const query = `cloudAccountId=${encodeURIComponent(cloudAccountId)}&region=${encodeURIComponent(region)}&resourceType=${encodeURIComponent(resourceType)}`;
    return proxyToBackend(request, `/api/automation/resources/catalog?${query}`);
}
