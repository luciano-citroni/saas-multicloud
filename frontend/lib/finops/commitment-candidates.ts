export type CommitmentCandidateReason =
    | 'stable_spend'
    | 'consistent_usage'
    | 'compute_eligible'
    | 'long_running_instance';

export type CommitmentCandidateCostSource = 'resource' | 'service_apportioned' | 'none';

export type CommitmentCandidate = {
    cloudAccountId: string;
    cloudProvider: string;
    resourceId: string;
    service: string;
    region: string;
    totalCost: number;
    estimatedMonthlyCost: number;
    estimatedSpMonthlySavings: number;
    estimatedSpSavingsPercentage: number | null;
    costSource?: CommitmentCandidateCostSource;
    activeDays: number;
    lookbackDays: number;
    stabilityScore: number;
    reasonCodes: CommitmentCandidateReason[];
    instanceType: string | null;
    launchAgeDays: number | null;
    currency: string;
};

export type CommitmentCandidatesResponse = {
    items: CommitmentCandidate[];
    lookbackDays: number;
};

export function candidateDisplayName(candidate: CommitmentCandidate): string {
    const id = candidate.resourceId?.trim() ?? '';
    if (!id) return '—';
    if (id.includes('/')) {
        const tail = id.split('/').filter(Boolean).pop();
        if (tail) return tail;
    }
    return id;
}

export function candidateSecondaryId(candidate: CommitmentCandidate): string | null {
    const id = candidate.resourceId?.trim() ?? '';
    const name = candidateDisplayName(candidate);
    if (!id || id === name) return null;
    if (id.includes('/')) {
        const parts = id.split('/').filter(Boolean);
        return parts.length > 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : id;
    }
    return id.length > 36 ? `${id.slice(0, 16)}…${id.slice(-10)}` : id;
}
