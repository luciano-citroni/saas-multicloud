export type KpiStatus = 'healthy' | 'warning' | 'critical';

export const FINOPS_KPI_THRESHOLDS = {
    growthWarning: 5,
    growthCritical: 15,
    criticalAnomaliesWarning: 1,
    criticalAnomaliesCritical: 3,
    openRecommendationsWarning: 3,
    openRecommendationsCritical: 8,
    savingsCoverageWarning: 12,
    savingsCoverageCritical: 5,
    forecastDeltaWarning: 5,
    forecastDeltaCritical: 15,
    healthPenaltyWarning: 3,
    healthPenaltyCritical: 6,
} as const;

export function getGrowthStatus(growthPercentage: number): KpiStatus {
    if (growthPercentage > FINOPS_KPI_THRESHOLDS.growthCritical) return 'critical';
    if (growthPercentage > FINOPS_KPI_THRESHOLDS.growthWarning) return 'warning';
    return 'healthy';
}

export function getAnomalyStatus(criticalAnomalies: number): KpiStatus {
    if (criticalAnomalies >= FINOPS_KPI_THRESHOLDS.criticalAnomaliesCritical) return 'critical';
    if (criticalAnomalies >= FINOPS_KPI_THRESHOLDS.criticalAnomaliesWarning) return 'warning';
    return 'healthy';
}

export function getRecommendationStatus(openRecommendations: number): KpiStatus {
    if (openRecommendations >= FINOPS_KPI_THRESHOLDS.openRecommendationsCritical) return 'critical';
    if (openRecommendations >= FINOPS_KPI_THRESHOLDS.openRecommendationsWarning) return 'warning';
    return 'healthy';
}

export function getSavingsCoverageStatus(savingsCoverage: number): KpiStatus {
    if (savingsCoverage < FINOPS_KPI_THRESHOLDS.savingsCoverageCritical) return 'critical';
    if (savingsCoverage < FINOPS_KPI_THRESHOLDS.savingsCoverageWarning) return 'warning';
    return 'healthy';
}

export function getForecastStatus(forecastDeltaPercentage: number | null): KpiStatus {
    if (forecastDeltaPercentage == null) return 'warning';
    if (forecastDeltaPercentage > FINOPS_KPI_THRESHOLDS.forecastDeltaCritical) return 'critical';
    if (forecastDeltaPercentage > FINOPS_KPI_THRESHOLDS.forecastDeltaWarning) return 'warning';
    return 'healthy';
}

function statusPenalty(status: KpiStatus): number {
    if (status === 'critical') return 2;
    if (status === 'warning') return 1;
    return 0;
}

export function getPortfolioHealth(statuses: KpiStatus[]): KpiStatus {
    const penalty = statuses.reduce((sum, status) => sum + statusPenalty(status), 0);

    if (penalty >= FINOPS_KPI_THRESHOLDS.healthPenaltyCritical) return 'critical';
    if (penalty >= FINOPS_KPI_THRESHOLDS.healthPenaltyWarning) return 'warning';
    return 'healthy';
}
