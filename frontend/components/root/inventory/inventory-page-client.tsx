'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import {
    fetchInventoryOverview,
    fetchInventoryResources,
    type InventoryOverview,
    type InventoryResource,
} from '@/app/actions/cloud-inventory';
import { enqueueGeneralSync } from '@/app/actions/organization';
import { PageHeader } from '@/components/root/layout';
import { InventoryFilterBar } from '@/components/root/inventory/inventory-filter-bar';
import { InventoryKpiCards } from '@/components/root/inventory/inventory-kpi-cards';
import { InventoryMonthlyChart } from '@/components/root/inventory/inventory-monthly-chart';
import { InventoryResourcesTable } from '@/components/root/inventory/inventory-resources-table';
import { InventorySubnav } from '@/components/root/inventory/inventory-subnav';
import {
    buildInventoryQuery,
    DEFAULT_INVENTORY_LIMIT,
    DEFAULT_INVENTORY_PAGE,
    parseInventoryUrlFilters,
    type InventoryUrlFilters,
} from '@/components/root/inventory/inventory-filter-utils';
import { Button } from '@/components/ui/button';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import { useCloudAccounts } from '@/lib/queries/use-cloud-accounts';
import { useOrganizationFromSidebar } from '@/lib/queries/use-sidebar-context';
import {
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';
import { canSyncCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

export function InventoryPageClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations('inventory');
    const tc = useTranslations('common');

    const urlFilters = useMemo(() => parseInventoryUrlFilters(searchParams), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [isContextLoading, setIsContextLoading] = useState(true);

    const { organization, currentRole: rawRole } = useOrganizationFromSidebar(organizationId);
    const currentRole = normalizeOrganizationRole(rawRole);
    const cloudAccountsQuery = useCloudAccounts(organizationId);
    const activeCloudAccount =
        cloudAccountId && cloudAccountsQuery.data
            ? (cloudAccountsQuery.data.find((account) => account.id === cloudAccountId) ?? null)
            : null;

    const modulesReady = Boolean(organization);
    const hasInventoryModule = modulesReady
        ? hasModuleAccess(normalizePlanModules(organization?.plans ?? []), PlanModule.CLOUD_INVENTORY)
        : null;

    const [overview, setOverview] = useState<InventoryOverview | null>(null);
    const [resources, setResources] = useState<InventoryResource[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingTable, setLoadingTable] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [searchDraft, setSearchDraft] = useState(urlFilters.q);

    const syncUrlState = useCallback(
        (next: Partial<InventoryUrlFilters>) => {
            const query = buildInventoryQuery(searchParams, next);
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    useEffect(() => {
        setSearchDraft(urlFilters.q);
    }, [urlFilters.q]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (searchDraft === urlFilters.q) return;
            syncUrlState({ q: searchDraft, page: DEFAULT_INVENTORY_PAGE });
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchDraft, syncUrlState, urlFilters.q]);

    const refreshContext = useCallback(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setCloudAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
        setIsContextLoading(false);
    }, []);

    useEffect(() => {
        refreshContext();

        const handleContextChange = () => refreshContext();
        const handleStorage = (event: StorageEvent) => {
            if (
                event.key &&
                event.key !== ACTIVE_ORG_STORAGE_KEY &&
                event.key !== ACTIVE_CLOUD_GLOBAL_KEY
            ) {
                return;
            }
            refreshContext();
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
    }, [refreshContext]);

    useEffect(() => {
        if (!organizationId || !cloudAccountsQuery.isSuccess) {
            return;
        }

        const storedCloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        const nextActive = cloudAccountsQuery.data.find((account) => account.id === storedCloudId) ?? null;
        setCloudAccountId(nextActive?.id ?? null);
    }, [cloudAccountsQuery.data, cloudAccountsQuery.isSuccess, organizationId]);

    const loadOverview = useCallback(async () => {
        if (!organizationId || !cloudAccountId || hasInventoryModule !== true) {
            setOverview(null);
            return;
        }

        setLoadingOverview(true);
        try {
            const response = await fetchInventoryOverview(organizationId, cloudAccountId, urlFilters.period);
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                setOverview(null);
                return;
            }
            setOverview(body as InventoryOverview);
        } catch {
            toast.error(t.loadError);
            setOverview(null);
        } finally {
            setLoadingOverview(false);
        }
    }, [cloudAccountId, hasInventoryModule, organizationId, t.loadError, urlFilters.period]);

    const loadResources = useCallback(async () => {
        if (!organizationId || !cloudAccountId || hasInventoryModule !== true) {
            setResources([]);
            setPagination(null);
            return;
        }

        setLoadingTable(true);
        try {
            const response = await fetchInventoryResources(organizationId, cloudAccountId, {
                q: urlFilters.q || undefined,
                resourceType: urlFilters.resourceType || undefined,
                region: urlFilters.region || undefined,
                period: urlFilters.period,
                page: urlFilters.page,
                limit: urlFilters.limit || DEFAULT_INVENTORY_LIMIT,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                setResources([]);
                setPagination(null);
                return;
            }

            const payload = body as {
                items?: InventoryResource[];
                pagination?: PaginationMeta;
            };
            setResources(Array.isArray(payload.items) ? payload.items : []);
            setPagination(payload.pagination ?? null);
        } catch {
            toast.error(t.loadError);
            setResources([]);
            setPagination(null);
        } finally {
            setLoadingTable(false);
        }
    }, [
        cloudAccountId,
        hasInventoryModule,
        organizationId,
        t.loadError,
        urlFilters.limit,
        urlFilters.page,
        urlFilters.period,
        urlFilters.q,
        urlFilters.region,
        urlFilters.resourceType,
    ]);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        void loadResources();
    }, [loadResources]);

    const handleSync = useCallback(async () => {
        if (!organizationId || !cloudAccountId || !activeCloudAccount) return;
        setSyncing(true);
        try {
            const response = await enqueueGeneralSync(
                organizationId,
                cloudAccountId,
                activeCloudAccount.provider,
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.syncQueued);
            window.setTimeout(() => {
                void loadOverview();
                void loadResources();
            }, 2500);
        } catch {
            toast.error(t.syncError);
        } finally {
            setSyncing(false);
        }
    }, [activeCloudAccount, cloudAccountId, loadOverview, loadResources, organizationId, t.syncError, t.syncQueued]);

    const canSync = canSyncCloudAccounts(currentRole);

    if (isContextLoading || hasInventoryModule === null) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title={t.title} description={t.loading} />
                <InventorySubnav />
            </div>
        );
    }

    if (hasInventoryModule === false) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title={t.title} description={t.moduleNotEnabled} />
            </div>
        );
    }

    if (!organizationId || !cloudAccountId || !activeCloudAccount) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title={t.title} description={t.selectAccount} />
                <InventorySubnav />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={t.title}
                description={t.subtitle
                    .replace('{account}', activeCloudAccount.alias)
                    .replace('{provider}', activeCloudAccount.provider.toUpperCase())}
                eyebrow={
                    <span className="inline-flex items-center gap-1.5 text-xs">
                        <Cloud className="size-3.5" />
                        {activeCloudAccount.alias}
                    </span>
                }
                actions={
                    <div className="grid w-full gap-2 lg:flex lg:w-auto">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full lg:w-auto"
                            isLoading={loadingOverview || loadingTable}
                            onClick={() => {
                                void loadOverview();
                                void loadResources();
                            }}
                        >
                            <RefreshCw className="size-4" />
                            {tc.refresh}
                        </Button>
                        {canSync ? (
                            <Button
                                type="button"
                                size="sm"
                                className="w-full lg:w-auto"
                                isLoading={syncing}
                                onClick={() => void handleSync()}
                            >
                                {t.syncInventory}
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <InventorySubnav />

            <InventoryFilterBar
                period={urlFilters.period}
                q={searchDraft}
                resourceType={urlFilters.resourceType}
                region={urlFilters.region}
                resourceTypeOptions={overview?.resourceTypes ?? []}
                regionOptions={overview?.regions ?? []}
                onPeriodChange={(period) => syncUrlState({ period, page: DEFAULT_INVENTORY_PAGE })}
                onQueryChange={setSearchDraft}
                onResourceTypeChange={(resourceType) =>
                    syncUrlState({ resourceType, page: DEFAULT_INVENTORY_PAGE })
                }
                onRegionChange={(region) => syncUrlState({ region, page: DEFAULT_INVENTORY_PAGE })}
                onClear={() => {
                    setSearchDraft('');
                    syncUrlState({
                        period: 'all',
                        q: '',
                        resourceType: '',
                        region: '',
                        page: DEFAULT_INVENTORY_PAGE,
                        limit: DEFAULT_INVENTORY_LIMIT,
                    });
                }}
            />

            <InventoryKpiCards
                totalResources={overview?.totalResources ?? 0}
                newThisMonth={overview?.newThisMonth ?? 0}
                typeCount={overview ? Object.keys(overview.byType).length : 0}
                isLoading={loadingOverview}
            />

            <InventoryMonthlyChart data={overview?.monthlyNew ?? []} isLoading={loadingOverview} />

            <InventoryResourcesTable
                items={resources}
                pagination={pagination}
                isLoading={loadingTable}
                onPageChange={(page) => syncUrlState({ page })}
            />
        </div>
    );
}
