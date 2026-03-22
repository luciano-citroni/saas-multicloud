export enum PlanModule {
    ASSESSMENT = 'assessment',
    CLOUD_INVENTORY = 'cloud_inventory',
    FINOPS = 'finops',
}

export const MODULE_ALIAS_MAP: Partial<Record<string, PlanModule>> = {
    assessement: PlanModule.ASSESSMENT,
};

export const MODULE_LABEL_MAP: Record<PlanModule, string> = {
    [PlanModule.ASSESSMENT]: 'assessment',
    [PlanModule.CLOUD_INVENTORY]: 'cloud inventory',
    [PlanModule.FINOPS]: 'finops',
};

export function hasModuleAccess(modules: string[] | unknown, module: PlanModule): boolean {
    const normalized = normalizePlanModules(modules);

    if (normalized.includes('*')) {
        return true;
    }

    return normalized.includes(module);
}

export function normalizePlanModules(modules: string[] | unknown): string[] {
    if (!Array.isArray(modules)) {
        return [];
    }

    const expandedModules = modules.flatMap((moduleName) => {
        const value = String(moduleName ?? '').trim();

        if (!value) {
            return [];
        }

        if (value.startsWith('[') && value.endsWith(']')) {
            try {
                const parsed = JSON.parse(value) as unknown;
                if (Array.isArray(parsed)) {
                    return parsed.filter((entry): entry is string => typeof entry === 'string');
                }
            } catch {
                // fallback
            }
        }

        return [value];
    });

    const normalized = expandedModules
        .map((moduleName) => moduleName.trim().toLowerCase())
        .filter(Boolean)
        .map((moduleName) => MODULE_ALIAS_MAP[moduleName] ?? moduleName);

    if (normalized.includes('*')) return ['*'];

    return Array.from(new Set(normalized));
}

export function modulesLabel(modules: string[] | unknown): string {
    const normalized = normalizePlanModules(modules);
    if (normalized.includes('*')) return 'Todos os modulos';
    if (!normalized.length) return 'Nenhum modulo habilitado';

    return normalized.map((m) => (m in MODULE_LABEL_MAP ? MODULE_LABEL_MAP[m as PlanModule] : m)).join(', ');
}
