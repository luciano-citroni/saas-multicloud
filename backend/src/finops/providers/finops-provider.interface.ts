export interface FinopsCostEntry {
    service: string;
    resourceId: string;
    region: string | null;
    usageType: string;
    operation: string;
    cost: number;
    currency: string;
    usageQuantity: number;
    usageUnit: string;
    date: string; // ISO date string 'YYYY-MM-DD'
    tags?: Record<string, string>;
}

export interface FinopsCostCollectionResult {
    entries: FinopsCostEntry[];
    currency: string;
}

export interface FinopsProviderCredentials {
    /** Credenciais descriptografadas da cloud account (JSON parseado). */
    credentials: Record<string, any>;
    cloudAccountId: string;
}

/**
 * Interface que todos os providers de FinOps devem implementar.
 * Permite estender facilmente para novos provedores (GCP, OCI, etc.).
 */
export interface IFinopsProvider {
    /** Identificador único do provider (ex: 'aws', 'azure', 'gcp'). */
    readonly provider: string;

    /**
     * Coleta custos do provedor para o período informado (nível serviço/região).
     * @param creds Credenciais descriptografadas da conta.
     * @param startDate Data de início no formato YYYY-MM-DD.
     * @param endDate Data de fim no formato YYYY-MM-DD.
     * @param granularity Granularidade da coleta (DAILY | MONTHLY).
     */
    collectCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY',
    ): Promise<FinopsCostCollectionResult>;

    /**
     * Coleta custos no nível de recurso (resourceId preenchido).
     * Pode retornar lista vazia se o provedor/export não suportar.
     */
    collectResourceCosts(
        creds: FinopsProviderCredentials,
        startDate: string,
        endDate: string,
        granularity: 'DAILY' | 'MONTHLY',
    ): Promise<FinopsCostCollectionResult>;
}

/** Limites compartilhados da ingestão por recurso. */
export const FINOPS_RESOURCE_COST_MIN_ABS = 0.01;
export const FINOPS_RESOURCE_COST_TOP_N_PER_DAY = 500;

export function capResourceEntriesByDay(
    entries: FinopsCostEntry[],
    topN = FINOPS_RESOURCE_COST_TOP_N_PER_DAY,
    minAbs = FINOPS_RESOURCE_COST_MIN_ABS,
): FinopsCostEntry[] {
    const filtered = entries.filter(
        (e) => Boolean(e.resourceId?.trim()) && Math.abs(e.cost) >= minAbs,
    );

    const byDate = new Map<string, FinopsCostEntry[]>();
    for (const entry of filtered) {
        const list = byDate.get(entry.date) ?? [];
        list.push(entry);
        byDate.set(entry.date, list);
    }

    const capped: FinopsCostEntry[] = [];
    for (const list of byDate.values()) {
        list.sort((a, b) => Math.abs(b.cost) - Math.abs(a.cost));
        capped.push(...list.slice(0, topN));
    }
    return capped;
}
