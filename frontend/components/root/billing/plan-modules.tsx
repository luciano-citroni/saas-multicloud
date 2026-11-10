'use client';

import { Badge } from '@/components/ui/badge';
import { PlanModule, normalizePlanModules } from '@/lib/modules';
import { useTranslations } from '@/lib/i18n';

export function usePlanModuleLabels() {
    const t = useTranslations('billing');

    return (modules: string[] | unknown): string[] => {
        const normalized = normalizePlanModules(modules);
        if (normalized.includes('*')) return [t.allModules];
        if (!normalized.length) return [];

        return normalized.map((moduleName) => {
            if (moduleName === PlanModule.ASSESSMENT) return t.moduleAssessment;
            if (moduleName === PlanModule.CLOUD_INVENTORY) return t.moduleInventory;
            if (moduleName === PlanModule.FINOPS) return t.moduleFinops;
            if (moduleName === PlanModule.GOVERNANCE) return t.moduleGovernance;
            if (moduleName === PlanModule.AUTOMATION) return t.moduleAutomation;
            if (moduleName === PlanModule.CLOUD_INTELLIGENCE) return t.moduleCloudIntelligence;
            return moduleName;
        });
    };
}

export function PlanModulesBadges({
    modules,
    emptyLabel,
}: {
    modules: string[] | unknown;
    emptyLabel: string;
}) {
    const resolve = usePlanModuleLabels();
    const labels = resolve(modules);

    if (!labels.length) {
        return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
    }

    return (
        <ul className="flex flex-wrap gap-1.5">
            {labels.map((label) => (
                <li key={label}>
                    <Badge variant="secondary" className="font-normal">
                        {label}
                    </Badge>
                </li>
            ))}
        </ul>
    );
}
