export function resolveWorkerConcurrency(envVarName: string, fallback: number, max = 16): number {
    const parsed = Number(process.env[envVarName]);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback;
    }

    // Evita sobrecarga acidental de CPU/Redis por configuração exagerada.
    return Math.min(parsed, max);
}
