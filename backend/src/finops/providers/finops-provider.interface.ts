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
    /** Identificador único do provider (ex: 'aws', 'azure'). */
    readonly provider: string;

    /**
     * Coleta custos do provedor para o período informado.
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
}
