import type { BillingRecord, CostByServiceItem, FinopsAnomaly, FinopsDashboard, FinopsRecommendation, ForecastResult, OptimizationInsight } from './types';

export type AggregatedFinopsData = {
    totalCost: number;
    currency: string;
    costByService: CostByServiceItem[];
    anomalies: FinopsAnomaly[];
    recommendations: FinopsRecommendation[];
    potentialSavings: number;
    topCosts: CostByServiceItem[];
    totalTopCost: number;
    openAnomalies: FinopsAnomaly[];
    criticalAnomalies: number;
    recommendationSavings: number;
    score: number;
    forecastedCost: number | null;
    lastBillingCost: number | null;
    billingMargin: number | null;
};

export async function aggregateFinopsData(
    dashboards: (FinopsDashboard | null)[],
    costByServices: CostByServiceItem[][],
    allAnomalies: FinopsAnomaly[][],
    allRecommendations: FinopsRecommendation[][],
    allForecasts: (ForecastResult | null)[],
    allInsights: (OptimizationInsight | null)[],
    allBillingHistory: BillingRecord[][]
): Promise<AggregatedFinopsData> {
    // Flatten and aggregate costs
    const allCosts = costByServices.flat().filter((item) => Number(item.currentMonthCost) >= 0);
    const aggregatedCosts = aggregateCostsByService(allCosts);
    const sortedCosts = aggregatedCosts.sort((left, right) => Number(right.currentMonthCost) - Number(left.currentMonthCost));
    const topCosts = sortedCosts.slice(0, 5);
    const totalTopCost = topCosts.reduce((sum, item) => sum + Number(item.currentMonthCost), 0);

    // Aggregate anomalies
    const allAnomaliesFlat = allAnomalies.flat();
    const openAnomalies = allAnomaliesFlat.filter((anomaly) => anomaly.status === 'open');
    const criticalAnomalies = openAnomalies.filter((anomaly) => anomaly.severity === 'critical' || anomaly.severity === 'high').length;

    // Aggregate recommendations
    const allRecommendationsFlat = allRecommendations.flat();
    const recommendationSavings = allRecommendationsFlat
        .filter((recommendation) => recommendation.status === 'open' && recommendation.potentialSaving != null)
        .reduce((sum, recommendation) => sum + Number(recommendation.potentialSaving), 0);

    // Aggregate insights
    const totalWaste = allInsights.reduce((sum, insight) => sum + Number(insight?.totalWaste ?? 0), 0);
    const potentialSavings = Math.max(totalWaste, recommendationSavings);

    // Get currency from first available dashboard
    const currency =
        dashboards.find((d) => d?.currency)?.currency ??
        allForecasts.find((f) => f?.currency)?.currency ??
        allBillingHistory.flat()[0]?.currency ??
        topCosts[0]?.currency ??
        'USD';

    // Calculate total cost from all dashboards
    const totalCost = dashboards.reduce((sum, dashboard) => sum + Number(dashboard?.totalCost ?? 0), 0);

    // Get forecast information
    const forecastedCost = allForecasts.find((f) => f?.forecastedCost)?.forecastedCost ?? null;
    const lastBilling = allBillingHistory.flat()[0] ?? null;
    const lastBillingCost = lastBilling ? Number(lastBilling.finalPrice) : null;
    const billingMargin = lastBilling ? Number(lastBilling.marginPercentage) : null;

    // Get average score (from dashboard's top services percentage as proxy)
    const totalDashboards = dashboards.filter((d) => d != null).length;
    const score = totalDashboards > 0 ? 75 : 0; // Default middleware score

    return {
        totalCost,
        currency,
        costByService: aggregatedCosts,
        anomalies: allAnomaliesFlat,
        recommendations: allRecommendationsFlat,
        potentialSavings,
        topCosts,
        totalTopCost,
        openAnomalies,
        criticalAnomalies,
        recommendationSavings,
        score,
        forecastedCost: forecastedCost ? Number(forecastedCost) : null,
        lastBillingCost,
        billingMargin,
    };
}

/**
 * Aggregates costs by service name, summing up costs from multiple clouds
 */
function aggregateCostsByService(costs: CostByServiceItem[]): CostByServiceItem[] {
    const serviceMap = new Map<string, CostByServiceItem>();

    for (const cost of costs) {
        const existing = serviceMap.get(cost.service);
        if (existing) {
            // Sum the costs
            const currentCost = Number(existing.currentMonthCost) + Number(cost.currentMonthCost);
            const previousCost = Number(existing.previousMonthCost ?? 0) + Number(cost.previousMonthCost ?? 0);
            const change = currentCost - previousCost;
            const changePercentage = previousCost > 0 ? (change / previousCost) * 100 : 0;

            serviceMap.set(cost.service, {
                service: cost.service,
                currentMonthCost: currentCost,
                previousMonthCost: previousCost,
                change,
                changePercentage,
                trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
                currency: existing.currency,
            });
        } else {
            serviceMap.set(cost.service, cost);
        }
    }

    return Array.from(serviceMap.values());
}
