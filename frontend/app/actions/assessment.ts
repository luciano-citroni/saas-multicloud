export async function runAssessment(organizationId: string, cloudAccountId: string, provider = 'aws') {
    const normalizedProvider = provider.trim().toLowerCase();

    let basePath: string;
    if (normalizedProvider === 'azure') {
        basePath = `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}`;
    } else if (normalizedProvider === 'gcp') {
        basePath = `/api/gcp/assessment/accounts/${encodeURIComponent(cloudAccountId)}`;
    } else {
        basePath = `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}`;
    }

    const url = `${basePath}?organizationId=${encodeURIComponent(organizationId)}`;

    const response = await fetch(url, {
        method: 'POST',
    });

    return response;
}

export async function triggerGcpExcelReport(organizationId: string, cloudAccountId: string): Promise<Response> {
    const url = `/api/gcp/assessment/accounts/${encodeURIComponent(cloudAccountId)}/report?organizationId=${encodeURIComponent(organizationId)}`;
    return fetch(url, { method: 'POST' });
}

export async function pollGcpJobStatus(organizationId: string, cloudAccountId: string, jobId: string): Promise<Response> {
    const url = `/api/gcp/assessment/accounts/${encodeURIComponent(cloudAccountId)}/assessment-jobs/${encodeURIComponent(jobId)}?organizationId=${encodeURIComponent(organizationId)}`;
    return fetch(url, { cache: 'no-store' });
}

export function buildGcpExcelDownloadUrl(organizationId: string, cloudAccountId: string, jobId: string): string {
    return `/api/gcp/assessment/accounts/${encodeURIComponent(cloudAccountId)}/assessment-jobs/${encodeURIComponent(jobId)}/download?organizationId=${encodeURIComponent(organizationId)}`;
}

