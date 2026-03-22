export const ALL_MODULES_TOKEN = '*';

export const SYSTEM_MODULES = ['assessment', 'cloud_inventory'] as const;

export const SystemModule = {
    ASSESSMENT: 'assessment',
    CLOUD_INVENTORY: 'cloud_inventory',
} as const;

export type SystemModuleName = (typeof SYSTEM_MODULES)[number];

const systemModulesSet = new Set<string>(SYSTEM_MODULES);

export function normalizeModuleName(moduleName: string): string {
    return moduleName.trim().toLowerCase();
}

export function isKnownSystemModule(moduleName: string): boolean {
    return systemModulesSet.has(normalizeModuleName(moduleName));
}

export function normalizePlanModules(modules: readonly string[] | null | undefined): string[] {
    if (!modules?.length) {
        return [];
    }

    const normalized = modules.map((moduleName) => normalizeModuleName(moduleName)).filter(Boolean);

    if (normalized.includes(ALL_MODULES_TOKEN)) {
        return [ALL_MODULES_TOKEN];
    }

    return Array.from(new Set(normalized.filter((moduleName) => isKnownSystemModule(moduleName))));
}

export function parseModulesMetadata(rawModules: string): { modules: string[]; unknownModules: string[] } {
    const raw = rawModules.trim();

    if (!raw) {
        return { modules: [], unknownModules: [] };
    }

    if (raw === ALL_MODULES_TOKEN) {
        return { modules: [ALL_MODULES_TOKEN], unknownModules: [] };
    }

    // Stripe metadata values are strings. We support JSON array payloads like
    // '["assessment"]' and '["*"]' in addition to legacy CSV values.
    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                const normalizedFromJson = parsed.map((entry) => normalizeModuleName(String(entry ?? ''))).filter(Boolean);

                if (normalizedFromJson.includes(ALL_MODULES_TOKEN)) {
                    return { modules: [ALL_MODULES_TOKEN], unknownModules: [] };
                }

                const modulesFromJson = Array.from(new Set(normalizedFromJson.filter((moduleName) => isKnownSystemModule(moduleName))));
                const unknownFromJson = Array.from(new Set(normalizedFromJson.filter((moduleName) => !isKnownSystemModule(moduleName))));

                return { modules: modulesFromJson, unknownModules: unknownFromJson };
            }
        } catch {
            // fall through to CSV parser
        }
    }

    const normalized = raw
        .split(',')
        .map((moduleName) => normalizeModuleName(moduleName))
        .filter(Boolean);

    const modules = Array.from(new Set(normalized.filter((moduleName) => isKnownSystemModule(moduleName))));
    const unknownModules = Array.from(new Set(normalized.filter((moduleName) => !isKnownSystemModule(moduleName))));

    return { modules, unknownModules };
}
