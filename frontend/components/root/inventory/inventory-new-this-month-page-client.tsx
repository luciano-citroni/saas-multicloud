'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Cloud, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
    fetchInventoryResources,
    type InventoryResource,
    type InventoryResourcesFacets,
} from '@/app/actions/cloud-inventory';
import { PageHeader } from '@/components/root/layout';
import { InventoryBrowseFilters } from '@/components/root/inventory/inventory-browse-filters';
import { InventorySubnav } from '@/components/root/inventory/inventory-subnav';
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

type PageState = {
    type: string;
    q: string;
    region: string;
    tag: string;
    page: number;
};

function parsePageState(searchParams: URLSearchParams): PageState {
    const pageRaw = Number.parseInt(searchParams.get('page') ?? '', 10);
    return {
        type: searchParams.get('type')?.trim() ?? '',
        q: searchParams.get('q')?.trim() ?? '',
        region: searchParams.get('region')?.trim() ?? '',
        tag: searchParams.get('tag')?.trim() ?? '',
        page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : DEFAULT_PAGE,
    };
}

export function InventoryNewThisMonthPageClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations('inventory');
    const tc = useTranslations('common');

    const pageState = useMemo(() => parsePageState(searchParams), [searchParams]);

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

    const [resources, setResources] = useState<InventoryResource[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [facets, setFacets] = useState<InventoryResourcesFacets>({ regions: [], tags: [] });
    const [byType, setByType] = useState<Record<string, number>>({});
    const [loadingTable, setLoadingTable] = useState(false);
    const [nameDraft, setNameDraft] = useState(pageState.q);

    const syncUrlState = useCallback(
        (next: Partial<PageState>) => {
            const params = new URLSearchParams(searchParams.toString());
            const merged: PageState = { ...pageState, ...next };

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
        [pageState, pathname, router, searchParams],
    );

    useEffect(() => {
        setNameDraft(pageState.q);
    }, [pageState.q]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (nameDraft === pageState.q) return;
            syncUrlState({ q: nameDraft, page: DEFAULT_PAGE });
        }, 300);
        return () => window.clearTimeout(timer);
    }, [nameDraft, pageState.q, syncUrlState]);

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

    const loadResources = useCallback(async () => {
        if (!organizationId || !cloudAccountId || hasInventoryModule !== true) {
            setResources([]);
            setPagination(null);
            setByType({});
            return;
        }

        setLoadingTable(true);
        try {
            const response = await fetchInventoryResources(organizationId, cloudAccountId, {
                resourceType: pageState.type || undefined,
                q: pageState.q || undefined,
                region: pageState.region || undefined,
                tag: pageState.tag || undefined,
                period: 'thismonth',
                page: pageState.page,
                limit: DEFAULT_LIMIT,
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                setResources([]);
                setPagination(null);
                setByType({});
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
            setByType(payload.byType && typeof payload.byType === 'object' ? payload.byType : {});
            if (payload.facets) {
                setFacets({
                    regions: Array.isArray(payload.facets.regions) ? payload.facets.regions : [],
                    tags: Array.isArray(payload.facets.tags) ? payload.facets.tags : [],
                });
            }
        } catch {
            toast.error(t.loadError);
            setResources([]);
            setPagination(null);
            setByType({});
        } finally {
            setLoadingTable(false);
        }
    }, [
        cloudAccountId,
        hasInventoryModule,
        organizationId,
        pageState.page,
        pageState.q,
        pageState.region,
        pageState.tag,
        pageState.type,
        t.loadError,
    ]);

    useEffect(() => {
        void loadResources();
    }, [loadResources]);

    const resourceTypeOptions = useMemo(
        () => Object.keys(byType).sort((a, b) => a.localeCompare(b)),
        [byType],
    );

    if (isContextLoading || hasInventoryModule === null) {
        return (
            <div className="flex flex-col gap-6 pb-24">
                <PageHeader title={t.newThisMonthTitle} description={t.loading} />
                <InventorySubnav />
            </div>
        );
    }

    if (hasInventoryModule === false) {
        return (
            <div className="flex flex-col gap-6 pb-24">
                <PageHeader title={t.newThisMonthTitle} description={t.moduleNotEnabled} />
            </div>
        );
    }

    if (!organizationId || !cloudAccountId || !activeCloudAccount) {
        return (
            <div className="flex flex-col gap-6 pb-24">
                <PageHeader title={t.newThisMonthTitle} description={t.selectAccount} />
                <InventorySubnav />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-24">
            <PageHeader
                title={t.newThisMonthTitle}
                description={t.newThisMonthSubtitle
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
                        isLoading={loadingTable}
                        onClick={() => void loadResources()}
                    >
                        <RefreshCw className="size-4" />
                        {tc.refresh}
                    </Button>
                }
            />

            <InventorySubnav />

            <InventoryBrowseFilters
                name={nameDraft}
                resourceType={pageState.type}
                region={pageState.region}
                tag={pageState.tag}
                resourceTypeOptions={resourceTypeOptions}
                regionOptions={facets.regions}
                tagOptions={facets.tags}
                onNameChange={setNameDraft}
                onResourceTypeChange={(resourceType) =>
                    syncUrlState({ type: resourceType, page: DEFAULT_PAGE })
                }
                onRegionChange={(region) => syncUrlState({ region, page: DEFAULT_PAGE })}
                onTagChange={(tag) => syncUrlState({ tag, page: DEFAULT_PAGE })}
                onClear={() => {
                    setNameDraft('');
                    syncUrlState({
                        type: '',
                        q: '',
                        region: '',
                        tag: '',
                        page: DEFAULT_PAGE,
                    });
                }}
            />

            <InventoryTypeDetailTable
                resourceType={pageState.type || null}
                items={resources}
                pagination={pagination}
                isLoading={loadingTable}
                showTypeColumn={!pageState.type}
                onPageChange={(page) => syncUrlState({ page })}
            />
        </div>
    );
}
