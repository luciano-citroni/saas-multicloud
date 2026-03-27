export type GovernanceJob = {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    score: number | null;
    totalFindings: number | null;
    totalChecks: number | null;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
};

export type GovernanceScore = {
    jobId: string;
    score: number;
    totalFindings: number;
    totalChecks: number;
    criticalFindings: number;
    highFindings: number;
    evaluatedAt: string;
};

export type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

export type SidebarContextPayload = {
    organizations?: Array<{ id?: string; currentRole?: string | null }>;
};
