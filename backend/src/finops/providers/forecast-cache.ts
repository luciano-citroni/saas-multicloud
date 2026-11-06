const FORECAST_CACHE_MS = 6 * 60 * 60 * 1000;

const store = new Map<string, { expiresAt: number; value: unknown }>();

export function readForecastCache<T>(key: string): T | undefined {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
    }
    return hit.value as T;
}

export function writeForecastCache(key: string, value: unknown): void {
    store.set(key, { expiresAt: Date.now() + FORECAST_CACHE_MS, value });
}
