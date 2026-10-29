'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from '@/lib/i18n';
import { hasAutomationModuleAccess, hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import {
    ACTIVE_ORG_MODULES_STORAGE_KEY,
    ACTIVE_ORG_STORAGE_KEY,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';
import { useSidebarContext } from '@/lib/queries/use-sidebar-context';

type ModuleRouteConfig = {
    prefix: string;
    module: PlanModule;
};

const MODULE_ROUTE_CONFIG: ModuleRouteConfig[] = [
    { prefix: '/assessment', module: PlanModule.ASSESSMENT },
    { prefix: '/governance', module: PlanModule.GOVERNANCE },
    { prefix: '/finops', module: PlanModule.FINOPS },
    { prefix: '/automation', module: PlanModule.AUTOMATION },
    { prefix: '/automations', module: PlanModule.AUTOMATION },
];

function resolveRequiredModule(pathname: string): PlanModule | null {
    const matched = MODULE_ROUTE_CONFIG.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
    return matched?.module ?? null;
}

function checkModuleAccess(enabledModules: string[], requiredModule: PlanModule): boolean {
    if (requiredModule === PlanModule.AUTOMATION) {
        return hasAutomationModuleAccess(enabledModules);
    }
    return hasModuleAccess(enabledModules, requiredModule);
}

export function ModuleAccessGuard() {
    const router = useRouter();
    const pathname = usePathname();
    const tn = useTranslations('nav');
    const blockedPathRef = useRef<string | null>(null);
    const sidebarQuery = useSidebarContext();

    const validateCurrentRouteAccess = useCallback(() => {
        const requiredModule = resolveRequiredModule(pathname);

        if (!requiredModule) {
            blockedPathRef.current = null;
            return;
        }

        const activeOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);

        if (!activeOrganizationId) {
            if (blockedPathRef.current !== pathname) {
                toast.error(tn.moduleNotEnabled);
                blockedPathRef.current = pathname;
            }

            router.replace('/');
            return;
        }

        const cachedModulesJson = window.localStorage.getItem(ACTIVE_ORG_MODULES_STORAGE_KEY);
        if (cachedModulesJson !== null) {
            try {
                const enabledModules = JSON.parse(cachedModulesJson) as string[];
                // Cache só libera acesso cedo; negação sempre confirma com o sidebar fresco.
                if (checkModuleAccess(enabledModules, requiredModule)) {
                    blockedPathRef.current = null;
                    return;
                }
            } catch {
                // Corrupted cache — fall through to shared query data.
            }
        }

        if (!sidebarQuery.data) {
            return;
        }

        const activeOrganization = sidebarQuery.data.organizations.find((organization) => organization.id === activeOrganizationId);
        const enabledModules = normalizePlanModules(activeOrganization?.plans ?? []);
        const hasAccess = checkModuleAccess(enabledModules, requiredModule);

        if (hasAccess) {
            blockedPathRef.current = null;
            // Mantém o cache alinhado com o snapshot mais recente.
            window.localStorage.setItem(ACTIVE_ORG_MODULES_STORAGE_KEY, JSON.stringify(enabledModules));
            return;
        }

        if (blockedPathRef.current !== pathname) {
            toast.error(tn.moduleNotEnabled);
            blockedPathRef.current = pathname;
        }

        router.replace('/');
    }, [pathname, router, sidebarQuery.data, tn.moduleNotEnabled]);

    useEffect(() => {
        validateCurrentRouteAccess();
    }, [validateCurrentRouteAccess]);

    useEffect(() => {
        const handleContextChange = () => {
            validateCurrentRouteAccess();
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== ACTIVE_ORG_STORAGE_KEY) {
                return;
            }

            validateCurrentRouteAccess();
        };

        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
        window.addEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
        window.addEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleContextChange);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT, handleContextChange);
            window.removeEventListener(SIDEBAR_CONTEXT_UPDATED_EVENT, handleContextChange);
            window.removeEventListener('storage', handleStorage);
        };
    }, [validateCurrentRouteAccess]);

    return null;
}
