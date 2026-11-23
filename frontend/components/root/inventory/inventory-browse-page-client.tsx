'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Cloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
    fetchInventoryOverview,
    fetchInventoryResources,
    type InventoryOverview,
    type InventoryResource,
    type InventoryResourcesFacets,
} from '@/app/actions/cloud-inventory';
import { PageHeader } from '@/components/root/layout';
import { InventoryBrowseFilters } from '@/components/root/inventory/inventory-browse-filters';
import { InventorySubnav } from '@/components/root/inventory/inventory-subnav';
import { InventoryTypeCatalog } from '@/components/root/inventory/inventory-type-catalog';
import { InventoryTypeDetailTable } from '@/components/root/inventory/inventory-type-detail-table';
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

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

type BrowseState = {
    type: string | null;
    q: string;
    region: string;
    tag: string;
    page: number;
};

function parseBrowseState(searchParams: URLSearchParams): BrowseState {
    const pageRaw = Number.parseInt(searchParams.get('page') ?? '', 10);
    return {
        type: searchParams.get('type')?.trim() || null,
        q: searchParams.get('q')?.trim() ?? '',
        region: searchParams.get('region')?.trim() ?? '',
        tag: searchParams.get('tag')?.trim() ?? '',
        page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : DEFAULT_PAGE,
    };
}

export function InventoryBrowsePageClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations('inventory');
    const tc = useTranslations('common');

    const browseState = useMemo(() => parseBrowseState(searchParams), [searchParams]);
    const hasCatalogFilters = Boolean(browseState.region || browseState.tag || browseState.q);
    const hasListFilters = Boolean(browseState.type || hasCatalogFilters);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [isContextLoading, setIsContextLoading] = useState(true);

    const { organization } = useOrganizationFromSidebar(organizationId);
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
    const [facets, setFacets] = useState<InventoryResourcesFacets>({ regions: [], tags: [] });
    const [filteredByType, setFilteredByType] = useState<Record<string, number> | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(false);
    const [loadingTable, setLoadingTable] = useState(false);
    const [nameDraft, setNameDraft] = useState(browseState.q);

    const syncUrlState = useCallback(
        (next: Partial<BrowseState>) => {
            const params = new URLSearchParams(searchParams.toString());
            const merged: BrowseState = {
                ...browseState,
                ...next,
            };

            if (!merged.type) params.delete('type');
            else params.set('type', merged.type);

            if (!merged.q) params.delete('q');
            else params.set('q', merged.q);

            if (!merged.region) params.delete('region');
            else params.set('region', merged.region);

            if (!merged.tag) params.delete('tag');
            else params.set('tag', merged.tag);

            if (!merged.page || merged.page === DEFAULT_PAGE) params.delete('page');
            else params.set('page', String(merged.page));

            const query = params.toString();
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [browseState, pathname, router, searchParams],
    );

    useEffect(() => {
        setNameDraft(browseState.q);
    }, [browseState.q]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (nameDraft === browseState.q) return;
            syncUrlState({ q: nameDraft, page: DEFAULT_PAGE });
        }, 300);
        return () => window.clearTimeout(timer);
    }, [browseState.q, nameDraft, syncUrlState]);

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
        if (!organizationId || !cloudAccountsQuery.isSuccess) return;
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
            const response = await fetchInventoryOverview(organizationId, cloudAccountId, 'all');
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                setOverview(null);
                return;
            }
            const payload = body as InventoryOverview;
            setOverview(payload);
            // Prefer overview facets on the catalog; resource response can refine them later.
            setFacets({
                regions: Array.isArray(payload.regions) ? payload.regions : [],
                tags: Array.isArray(payload.tags) ? payload.tags : [],
            });
        } catch {
            toast.error(t.loadError);
            setOverview(null);
        } finally {
            setLoadingOverview(false);
        }
    }, [cloudAccountId, hasInventoryModule, organizationId, t.loadError]);

    const loadResources = useCallback(async () => {
        if (!organizationId || !cloudAccountId || hasInventoryModule !== true || !hasListFilters) {
            setResources([]);
            setPagination(null);
            setFilteredByType(null);
            return;
        }
        setLoadingTable(true);
        try {
            const response = await fetchInventoryResources(organizationId, cloudAccountId, {
                resourceType: browseState.type || undefined,
                q: browseState.q || undefined,
                region: browseState.region || undefined,
                tag: browseState.tag || undefined,
                period: 'all',
                page: browseState.page,
                limit: DEFAULT_LIMIT,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                setResources([]);
                setPagination(null);
                setFilteredByType(null);
                return;
            }
            const payload = body as {
                items?: InventoryResource[];
                pagination?: PaginationMeta;
                facets?: InventoryResourcesFacets;
                byType?: Record<string, number>;
            };
            setResources(Array.isArray(payload.items) ? payload.items : []);
            setPagination(payload.pagination ?? null);
            setFilteredByType(
                payload.byType && typeof payload.byType === 'object' ? payload.byType : null,
            );
            if (payload.facets) {
                setFacets((prev) => ({
                    regions: Array.isArray(payload.facets?.regions) ? payload.facets.regions : prev.regions,
                    tags: Array.isArray(payload.facets?.tags) ? payload.facets.tags : prev.tags,
                }));
            }
        } catch {
            toast.error(t.loadError);
            setResources([]);
            setPagination(null);
            setFilteredByType(null);
        } finally {
            setLoadingTable(false);
        }
    }, [
        browseState.page,
        browseState.q,
        browseState.region,
        browseState.tag,
        browseState.type,
        cloudAccountId,
        hasInventoryModule,
        hasListFilters,
        organizationId,
        t.loadError,
    ]);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        void loadResources();
    }, [loadResources]);

    const regionOptions = facets.regions.length > 0 ? facets.regions : (overview?.regions ?? []);
    const tagOptions = facets.tags.length > 0 ? facets.tags : (overview?.tags ?? []);
    const catalogByType = useMemo(() => {
        if (hasCatalogFilters && filteredByType) {
            return filteredByType;
        }
        return overview?.byType ?? {};
    }, [filteredByType, hasCatalogFilters, overview?.byType]);
    const resourceTypeOptions = useMemo(() => {
        const fromCatalog = Object.keys(catalogByType);
        if (fromCatalog.length > 0) return fromCatalog.sort((a, b) => a.localeCompare(b));
        return overview?.resourceTypes ?? Object.keys(overview?.byType ?? {});
    }, [catalogByType, overview?.byType, overview?.resourceTypes]);

    if (isContextLoading || hasInventoryModule === null) {
        return (
            <div className="flex flex-col gap-6 pb-24">
                <PageHeader title={t.browseTitle} description={t.loading} />
                <InventorySubnav />
            </div>
        );
    }

    if (hasInventoryModule === false) {
        return (
            <div className="flex flex-col gap-6 pb-24">
                <PageHeader title={t.browseTitle} description={t.moduleNotEnabled} />
            </div>
        );
    }

    if (!organizationId || !cloudAccountId || !activeCloudAccount) {
        return (
            <div className="flex flex-col gap-6 pb-24">
                <PageHeader title={t.browseTitle} description={t.selectAccount} />
                <InventorySubnav />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-24">
            <PageHeader
                title={t.browseTitle}
                description={t.browseSubtitle
                    .replace('{account}', activeCloudAccount.alias)
                    .replace('{provider}', activeCloudAccount.provider.toUpperCase())}
                eyebrow={
                    <span className="inline-flex items-center gap-1.5 text-xs">
                        <Cloud className="size-3.5" />
                        {activeCloudAccount.alias}
                    </span>
                }
                actions={
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
                }
            />

            <InventorySubnav />

            <InventoryBrowseFilters
                name={nameDraft}
                resourceType={browseState.type ?? ''}
                region={browseState.region}
                tag={browseState.tag}
                resourceTypeOptions={resourceTypeOptions}
                regionOptions={regionOptions}
                tagOptions={tagOptions}
                onNameChange={setNameDraft}
                onResourceTypeChange={(resourceType) =>
                    syncUrlState({ type: resourceType || null, page: DEFAULT_PAGE })
                }
                onRegionChange={(region) => syncUrlState({ region, page: DEFAULT_PAGE })}
                onTagChange={(tag) => syncUrlState({ tag, page: DEFAULT_PAGE })}
                onClear={() => {
                    setNameDraft('');
                    syncUrlState({
                        type: null,
                        q: '',
                        region: '',
                        tag: '',
                        page: DEFAULT_PAGE,
                    });
                }}
            />

            {!browseState.type ? (
                <InventoryTypeCatalog
                    byType={catalogByType}
                    selectedType={browseState.type}
                    onSelect={(resourceType) =>
                        syncUrlState({
                            type: resourceType,
                            page: DEFAULT_PAGE,
                        })
                    }
                    isLoading={loadingOverview || (hasCatalogFilters && loadingTable)}
                />
            ) : null}

            {hasListFilters ? (
                <InventoryTypeDetailTable
                    resourceType={browseState.type}
                    items={resources}
                    pagination={pagination}
                    isLoading={loadingTable}
                    showTypeColumn={!browseState.type}
                    onPageChange={(page) => syncUrlState({ page })}
                />
            ) : null}
        </div>
    );
}
