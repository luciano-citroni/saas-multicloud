export type ProjectionSource = 'provider' | 'mixed' | 'linear';

type ProjectionCopy = {
    commercialLinearBase: string;
    commercialForecastAws: string;
    commercialForecastAzure: string;
    commercialForecastProvider: string;
    commercialForecastMixed: string;
};

export function commercialProjectionDetail(
    source: ProjectionSource | undefined,
    providers: string[],
    baseDays: number,
    copy: ProjectionCopy,
): string {
    const count = String(baseDays);
    if (source === 'mixed') return copy.commercialForecastMixed.replace('{count}', count);
    if (source === 'provider') {
        const names = providers.map((provider) => provider.toUpperCase());
        if (names.length === 1 && names[0] === 'AWS') return copy.commercialForecastAws;
        if (names.length === 1 && names[0] === 'AZURE') return copy.commercialForecastAzure;
        return copy.commercialForecastProvider;
    }
    return copy.commercialLinearBase.replace('{count}', count);
}
