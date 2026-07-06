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

export type AssessmentExcelProvider = 'aws' | 'azure' | 'gcp';

export type AssessmentExcelJob = {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | string;
    error?: string | null;
    excelDownloadUrl?: string;
    excelExpiresAt?: string;
    createdAt?: string;
    completedAt?: string;
};

function normalizeExcelProvider(provider: string): AssessmentExcelProvider {
    const normalized = provider.trim().toLowerCase();

    if (normalized === 'azure') {
        return 'azure';
    }

    if (normalized === 'gcp') {
        return 'gcp';
    }

    return 'aws';
}

export async function triggerAssessmentExcelReport(organizationId: string, cloudAccountId: string, provider: string): Promise<Response> {
    const normalizedProvider = normalizeExcelProvider(provider);
    const basePath = `/api/${normalizedProvider}/assessment/accounts/${encodeURIComponent(cloudAccountId)}/report`;
    const url = `${basePath}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, { method: 'POST' });
}

function buildAssessmentJobPath(provider: AssessmentExcelProvider, cloudAccountId: string, jobId: string): string {
    if (provider === 'azure') {
        return `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}`;
    }

    return `/api/${provider}/assessment/accounts/${encodeURIComponent(cloudAccountId)}/assessment-jobs/${encodeURIComponent(jobId)}`;
}

export async function pollAssessmentExcelJobStatus(organizationId: string, cloudAccountId: string, jobId: string, provider: string): Promise<Response> {
    const normalizedProvider = normalizeExcelProvider(provider);
    const basePath = buildAssessmentJobPath(normalizedProvider, cloudAccountId, jobId);
    const url = `${basePath}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, { cache: 'no-store' });
}

function buildAssessmentJobsPath(provider: AssessmentExcelProvider, cloudAccountId: string): string {
    if (provider === 'azure') {
        return `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}/jobs`;
    }

    return `/api/${provider}/assessment/accounts/${encodeURIComponent(cloudAccountId)}/assessment-jobs`;
}

export async function fetchAssessmentExcelJobs(organizationId: string, cloudAccountId: string, provider: string): Promise<Response> {
    const normalizedProvider = normalizeExcelProvider(provider);
    const basePath = buildAssessmentJobsPath(normalizedProvider, cloudAccountId);
    const url = `${basePath}?organizationId=${encodeURIComponent(organizationId)}`;

    return fetch(url, { cache: 'no-store' });
}

export function buildAssessmentExcelDownloadUrl(organizationId: string, cloudAccountId: string, jobId: string, provider: string): string {
    const normalizedProvider = normalizeExcelProvider(provider);

    if (normalizedProvider === 'azure') {
        return `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}/jobs/${encodeURIComponent(jobId)}/download?organizationId=${encodeURIComponent(organizationId)}`;
    }

    return `/api/${normalizedProvider}/assessment/accounts/${encodeURIComponent(cloudAccountId)}/assessment-jobs/${encodeURIComponent(jobId)}/download?organizationId=${encodeURIComponent(organizationId)}`;
}

export type AssessmentDiagramExportPayload = {
    svgDataUrl: string;
    provider: string;
    exportedAt: string;
};

export async function exportAssessmentDiagram(payload: AssessmentDiagramExportPayload): Promise<Response> {
    return fetch('/api/assessment/diagram-export', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
}
