'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from '@/lib/i18n';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import {
    ACTIVE_ORG_MODULES_STORAGE_KEY,
    ACTIVE_ORG_STORAGE_KEY,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';

type SidebarContextPayload = {
    organizations?: Array<{
        id?: string;
        plans?: unknown;
    }>;
};

type ModuleRouteConfig = {
    prefix: string;
    module: PlanModule;
};

const MODULE_ROUTE_CONFIG: ModuleRouteConfig[] = [
    { prefix: '/assessment', module: PlanModule.ASSESSMENT },
    { prefix: '/governance', module: PlanModule.GOVERNANCE },
    { prefix: '/finops', module: PlanModule.FINOPS },
    { prefix: '/automation', module: PlanModule.CLOUD_INVENTORY },
];

function resolveRequiredModule(pathname: string): PlanModule | null {
    const matched = MODULE_ROUTE_CONFIG.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
    return matched?.module ?? null;
}

export function ModuleAccessGuard() {
    const router = useRouter();
    const pathname = usePathname();
    const tn = useTranslations('nav');
    const blockedPathRef = useRef<string | null>(null);

    const validateCurrentRouteAccess = useCallback(async () => {
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

        // Fast path: use the modules already resolved and cached by AppSidebar.
        // This avoids a duplicate /api/sidebar/context request on every pathname change.
        const cachedModulesJson = window.localStorage.getItem(ACTIVE_ORG_MODULES_STORAGE_KEY);
        if (cachedModulesJson !== null) {
            try {
                const enabledModules = JSON.parse(cachedModulesJson) as string[];
                const hasAccess = hasModuleAccess(enabledModules, requiredModule);
                if (hasAccess) {
                    blockedPathRef.current = null;
                    return;
                }
                if (blockedPathRef.current !== pathname) {
                    toast.error(tn.moduleNotEnabled);
                    blockedPathRef.current = pathname;
                }
                router.replace('/');
                return;
            } catch {
                // Corrupted cache entry — fall through to network fetch below.
            }
        }

        // Slow path: cache not yet populated (first-load race before AppSidebar finishes).
        // Falls back to a direct fetch so the guard never incorrectly blocks on first navigation.
        try {
            const response = await fetch('/api/sidebar/context', { cache: 'no-store' });

            if (!response.ok) {
                return;
            }

            const payload = (await response.json().catch(() => null)) as SidebarContextPayload | null;
            const activeOrganization = payload?.organizations?.find((organization) => organization?.id === activeOrganizationId);
            const enabledModules = normalizePlanModules(activeOrganization?.plans ?? []);
            const hasAccess = hasModuleAccess(enabledModules, requiredModule);

            if (hasAccess) {
                blockedPathRef.current = null;
                return;
            }

            if (blockedPathRef.current !== pathname) {
                toast.error(tn.moduleNotEnabled);
                blockedPathRef.current = pathname;
            }

            router.replace('/');
        } catch {
            // Se nao for possivel validar contexto, nao bloqueia para evitar falso negativo.
        }
    }, [pathname, router, tn]);

    useEffect(() => {
        void validateCurrentRouteAccess();
    }, [validateCurrentRouteAccess]);

    useEffect(() => {
        const handleContextChange = () => {
            void validateCurrentRouteAccess();
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== ACTIVE_ORG_STORAGE_KEY) {
                return;
            }

            void validateCurrentRouteAccess();
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
