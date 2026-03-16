export async function runAssessment(organizationId: string, cloudAccountId: string) {
    const url = `/api/aws/assessment/accounts/${encodeURIComponent(cloudAccountId)}?organizationId=${encodeURIComponent(organizationId)}`;

    const response = await fetch(url, {
        method: 'POST',
    });

    return response;
}
