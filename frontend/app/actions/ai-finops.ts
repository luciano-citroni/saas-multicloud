function withOrg(url: string, organizationId: string, extra?: Record<string, string | undefined>) {
    const params = new URLSearchParams({ organizationId });
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            if (value) params.set(key, value);
        }
    }
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}${params.toString()}`;
}

export async function fetchAiFinopsProviders(organizationId: string) {
    return fetch(withOrg('/api/ai-finops/providers', organizationId), { cache: 'no-store' });
}

export async function fetchAiFinopsConnections(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/connections', organizationId, { midOrganizationId }), {
        cache: 'no-store',
    });
}

export async function createAiFinopsConnection(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/connections', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function testAiFinopsConnection(organizationId: string, connectionId: string) {
    return fetch(withOrg(`/api/ai-finops/connections/${encodeURIComponent(connectionId)}/test`, organizationId), {
        method: 'POST',
    });
}

export async function syncAiFinopsConnection(organizationId: string, connectionId: string, body?: unknown) {
    return fetch(withOrg(`/api/ai-finops/connections/${encodeURIComponent(connectionId)}/sync`, organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? { syncType: 'manual' }),
    });
}

export async function fetchAiFinopsConnectionSyncs(organizationId: string, connectionId: string) {
    return fetch(
        withOrg(`/api/ai-finops/connections/${encodeURIComponent(connectionId)}/syncs`, organizationId),
        { cache: 'no-store' },
    );
}

export async function deleteAiFinopsConnection(organizationId: string, connectionId: string) {
    return fetch(withOrg(`/api/ai-finops/connections/${encodeURIComponent(connectionId)}`, organizationId), {
        method: 'DELETE',
    });
}

export async function fetchAiFinopsTeams(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/teams', organizationId, { midOrganizationId }), { cache: 'no-store' });
}

export async function createAiFinopsTeam(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/teams', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function deleteAiFinopsTeam(organizationId: string, teamId: string) {
    return fetch(withOrg(`/api/ai-finops/teams/${encodeURIComponent(teamId)}`, organizationId), {
        method: 'DELETE',
    });
}

export async function addAiFinopsTeamMember(organizationId: string, teamId: string, body: unknown) {
    return fetch(withOrg(`/api/ai-finops/teams/${encodeURIComponent(teamId)}/members`, organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function removeAiFinopsTeamMember(
    organizationId: string,
    teamId: string,
    memberUserId: string,
) {
    return fetch(
        withOrg(
            `/api/ai-finops/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberUserId)}`,
            organizationId,
        ),
        { method: 'DELETE' },
    );
}

export async function fetchAiFinopsApplications(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/applications', organizationId, { midOrganizationId }), {
        cache: 'no-store',
    });
}

export async function createAiFinopsApplication(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/applications', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function createAiFinopsApiKey(organizationId: string, applicationId: string, body: unknown) {
    return fetch(
        withOrg(`/api/ai-finops/applications/${encodeURIComponent(applicationId)}/api-keys`, organizationId),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    );
}

export async function fetchAiFinopsApiKeys(organizationId: string, applicationId: string) {
    return fetch(
        withOrg(`/api/ai-finops/applications/${encodeURIComponent(applicationId)}/api-keys`, organizationId),
        { cache: 'no-store' },
    );
}

export async function revokeAiFinopsApiKey(organizationId: string, applicationId: string, keyId: string) {
    return fetch(
        withOrg(
            `/api/ai-finops/applications/${encodeURIComponent(applicationId)}/api-keys/${encodeURIComponent(keyId)}/revoke`,
            organizationId,
        ),
        { method: 'POST' },
    );
}

export async function fetchAiFinopsPolicies(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/policies', organizationId, { midOrganizationId }), { cache: 'no-store' });
}

export async function createAiFinopsPolicy(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/policies', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function updateAiFinopsPolicy(
    organizationId: string,
    policyId: string,
    body: unknown,
) {
    return fetch(withOrg(`/api/ai-finops/policies/${encodeURIComponent(policyId)}`, organizationId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function deleteAiFinopsPolicy(organizationId: string, policyId: string) {
    return fetch(withOrg(`/api/ai-finops/policies/${encodeURIComponent(policyId)}`, organizationId), {
        method: 'DELETE',
    });
}

export async function fetchAiFinopsDashboard(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/dashboard', organizationId, query), { cache: 'no-store' });
}

export async function fetchAiFinopsCostUsers(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/users', organizationId, query), { cache: 'no-store' });
}

export async function fetchAiFinopsUsage(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/usage', organizationId, query), { cache: 'no-store' });
}

export async function exportAiFinopsUsage(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/usage/export', organizationId, query), { cache: 'no-store' });
}

export async function fetchAiFinopsExplorer(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/explorer', organizationId, query), { cache: 'no-store' });
}

export async function fetchAiFinopsModels(organizationId: string, providerId?: string) {
    return fetch(withOrg('/api/ai-finops/costs/models', organizationId, { providerId }), { cache: 'no-store' });
}

export async function fetchAiFinopsBudgets(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/costs/budgets', organizationId, { midOrganizationId }), {
        cache: 'no-store',
    });
}

export async function createAiFinopsBudget(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/costs/budgets', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function deleteAiFinopsBudget(organizationId: string, budgetId: string) {
    return fetch(withOrg(`/api/ai-finops/costs/budgets/${encodeURIComponent(budgetId)}`, organizationId), {
        method: 'DELETE',
    });
}

export async function fetchAiFinopsBudgetStatus(organizationId: string, budgetId: string) {
    return fetch(
        withOrg(`/api/ai-finops/costs/budgets/${encodeURIComponent(budgetId)}/status`, organizationId),
        { cache: 'no-store' },
    );
}

export async function fetchAiFinopsRecommendations(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/costs/recommendations', organizationId, { midOrganizationId }), {
        cache: 'no-store',
    });
}

export async function generateAiFinopsRecommendations(organizationId: string, midOrganizationId: string) {
    return fetch(withOrg('/api/ai-finops/costs/recommendations/generate', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: midOrganizationId }),
    });
}

export async function fetchAiFinopsLicenses(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/licenses', organizationId, { midOrganizationId }), { cache: 'no-store' });
}

export async function fetchAiFinopsLicensesSummary(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/licenses/summary', organizationId, { midOrganizationId }), {
        cache: 'no-store',
    });
}

export async function createAiFinopsLicense(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/licenses', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function deleteAiFinopsLicense(organizationId: string, licenseId: string) {
    return fetch(withOrg(`/api/ai-finops/licenses/${encodeURIComponent(licenseId)}`, organizationId), {
        method: 'DELETE',
    });
}

export async function upsertAiFinopsAzureCredits(organizationId: string, body: unknown) {
    return fetch(withOrg('/api/ai-finops/licenses/azure-credits', organizationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function syncAiFinopsCopilotSeats(organizationId: string, connectionId: string) {
    return fetch(
        withOrg(
            `/api/ai-finops/connections/${encodeURIComponent(connectionId)}/sync-copilot-seats`,
            organizationId,
        ),
        { method: 'POST' },
    );
}

export async function fetchAiFinopsExecutive(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/executive', organizationId, query), { cache: 'no-store' });
}

export async function fetchAiFinopsMom(organizationId: string, midOrganizationId?: string) {
    return fetch(withOrg('/api/ai-finops/costs/mom', organizationId, { midOrganizationId }), { cache: 'no-store' });
}

export async function fetchAiFinopsReconciliation(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/reconciliation', organizationId, query), { cache: 'no-store' });
}

export async function fetchAiFinopsHeatmap(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/heatmap', organizationId, query), { cache: 'no-store' });
}

export async function exportAiFinopsExecutiveCsv(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/export/executive.csv', organizationId, query), { cache: 'no-store' });
}

export async function exportAiFinopsExecutivePdf(
    organizationId: string,
    query: Record<string, string | undefined> = {},
) {
    return fetch(withOrg('/api/ai-finops/costs/export/executive.pdf', organizationId, query), { cache: 'no-store' });
}
