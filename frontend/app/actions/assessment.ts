export async function runAssessment(organizationId: string, cloudAccountId: string, provider = 'aws') {
    const normalizedProvider = provider.trim().toLowerCase();
    const basePath =
        normalizedProvider === 'azure'
            ? `/api/azure/assessment/accounts/${encodeURIComponent(cloudAccountId)}`
            : `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}`;
    const url = `${basePath}?organizationId=${encodeURIComponent(organizationId)}`;

    const response = await fetch(url, {
        method: 'POST',
    });

    return response;
}
