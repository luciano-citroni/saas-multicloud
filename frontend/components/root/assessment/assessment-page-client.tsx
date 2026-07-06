'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Edge, Node } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
    exportAssessmentDiagram,
    runAssessment,
    triggerAssessmentExcelReport,
    fetchAssessmentExcelJobs,
    buildAssessmentExcelDownloadUrl,
    type AssessmentExcelJob,
} from '@/app/actions/assessment';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { MemoizedAssessmentGraphCard } from '@/components/root/assessment/assessment-graph-card';
import { AssessmentToolbar, getGroupingModeLabel } from '@/components/root/assessment/assessment-toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    autoLayout,
    buildGroupedNodesByModes,
    filterNodesByVisibility,
    formatAssessmentProvider,
    normalizeAssessmentProvider,
    normalizeEdges,
    normalizeNodes,
    removeOrphanNodesByType,
} from '@/components/root/assessment/assessment-graph-utils';
import type { AssessmentGraphPayload, GroupingDimension, ResourceVisibilityFilterId, SidebarContextPayload } from '@/components/root/assessment/types';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import {
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';
import { useTranslations } from '@/lib/i18n';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

type CloudAccountApiItem = OrganizationCloudAccount;
type CloudAccountsApiPayload = CloudAccountApiItem[] | { items?: CloudAccountApiItem[] };
type AssessmentExcelJobsApiPayload = AssessmentExcelJob[] | { items?: AssessmentExcelJob[] };

type NodeBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const DEFAULT_NODE_WIDTH = 230;
const DEFAULT_NODE_HEIGHT = 80;
const EXPORT_PADDING = 80;
const MIN_EXPORT_WIDTH = 1200;
const MIN_EXPORT_HEIGHT = 720;
const MAX_EXPORT_SIZE = 10000;
const LOGO_EXPORT_WIDTH = 132;
const LOGO_EXPORT_MARGIN = 28;
const DEFAULT_GROUPING_MODES: GroupingDimension[] = ['region', 'vpc'];
const DEFAULT_HIDDEN_FILTER_IDS: ResourceVisibilityFilterId[] = [];
const GROUP_BY_QUERY_PARAM = 'groupBy';
const HIDDEN_FILTERS_QUERY_PARAM = 'hiddenFilters';
const VALID_GROUPING_MODES: GroupingDimension[] = ['resourceType', 'vpc', 'region'];
const VALID_HIDDEN_FILTER_IDS: ResourceVisibilityFilterId[] = ['securityGroups', 'taskDefinitions', 'managedIdentities'];
const REPORTS_POLL_INTERVAL_MS = 5000;

function normalizeGroupingModesFromUrl(value: string | null): GroupingDimension[] {
    if (!value) {
        return DEFAULT_GROUPING_MODES;
    }

    const parsed = value
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is GroupingDimension => VALID_GROUPING_MODES.includes(item as GroupingDimension));

    const unique = parsed.length > 0 ? [...new Set(parsed)] : [];

    if (unique.includes('region')) {
        return ['region', ...unique.filter((mode) => mode !== 'region')];
    }

    return unique;
}

function normalizeHiddenFiltersFromUrl(value: string | null): ResourceVisibilityFilterId[] {
    if (!value) {
        return DEFAULT_HIDDEN_FILTER_IDS;
    }

    const parsed = value
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is ResourceVisibilityFilterId => VALID_HIDDEN_FILTER_IDS.includes(item as ResourceVisibilityFilterId));

    return [...new Set(parsed)];
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    return a.every((value, index) => value === b[index]);
}

function areFilterSetsEqual(a: Set<ResourceVisibilityFilterId>, b: Set<ResourceVisibilityFilterId>): boolean {
    if (a.size !== b.size) {
        return false;
    }

    for (const value of a) {
        if (!b.has(value)) {
            return false;
        }
    }

    return true;
}

function formatExportTimestamp(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(date);
}

function resolveExportBackgroundColor(colorMode: 'light' | 'dark'): string {
    const fallbackColor = colorMode === 'dark' ? '#0f172a' : '#ffffff';
    const rawColor = getComputedStyle(document.body).backgroundColor?.trim().toLowerCase();

    if (!rawColor || rawColor === 'transparent' || rawColor === 'rgba(0, 0, 0, 0)' || rawColor === 'rgba(0,0,0,0)') {
        return fallbackColor;
    }

    return rawColor;
}

function getNodeSize(node: Node): { width: number; height: number } {
    const style = node.style as { width?: number | string; height?: number | string } | undefined;
    const styleWidth = typeof style?.width === 'number' ? style.width : Number(style?.width);
    const styleHeight = typeof style?.height === 'number' ? style.height : Number(style?.height);
    const width = node.measured?.width ?? node.width ?? (Number.isFinite(styleWidth) ? styleWidth : DEFAULT_NODE_WIDTH);
    const height = node.measured?.height ?? node.height ?? (Number.isFinite(styleHeight) ? styleHeight : DEFAULT_NODE_HEIGHT);

    return {
        width,
        height,
    };
}

function getAbsoluteNodeBounds(nodes: Node[]): NodeBounds | null {
    if (!nodes.length) {
        return null;
    }

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const resolvedPositions = new Map<string, { x: number; y: number }>();

    const resolvePosition = (node: Node): { x: number; y: number } => {
        const cached = resolvedPositions.get(node.id);
        if (cached) {
            return cached;
        }

        const ownPosition = {
            x: node.position?.x ?? 0,
            y: node.position?.y ?? 0,
        };

        if (!node.parentId) {
            resolvedPositions.set(node.id, ownPosition);
            return ownPosition;
        }

        const parent = nodesById.get(node.parentId);
        if (!parent) {
            resolvedPositions.set(node.id, ownPosition);
            return ownPosition;
        }

        const parentPosition = resolvePosition(parent);
        const absolutePosition = {
            x: parentPosition.x + ownPosition.x,
            y: parentPosition.y + ownPosition.y,
        };

        resolvedPositions.set(node.id, absolutePosition);
        return absolutePosition;
    };

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
        const absolutePosition = resolvePosition(node);
        const size = getNodeSize(node);

        minX = Math.min(minX, absolutePosition.x);
        minY = Math.min(minY, absolutePosition.y);
        maxX = Math.max(maxX, absolutePosition.x + size.width);
        maxY = Math.max(maxY, absolutePosition.y + size.height);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

async function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Falha ao carregar imagem.'));
        image.src = source;
    });
}

async function buildLogoObjectUrl(useBlackLogo: boolean): Promise<string> {
    const response = await fetch('/logo.svg', { cache: 'force-cache' });

    if (!response.ok) {
        throw new Error('Falha ao carregar logo.');
    }

    let svgMarkup = await response.text();

    if (useBlackLogo) {
        svgMarkup = svgMarkup.replace(/fill="[^"]+"/gi, 'fill="#000000"');
    }

    const logoBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(logoBlob);
}

async function composeExportWithLogo(
    dataUrl: string,
    useBlackLogo: boolean,
    backgroundColor: string,
    providerLabel: string,
    exportedAt: Date
): Promise<string> {
    const baseImage = await loadImage(dataUrl);
    const logoObjectUrl = await buildLogoObjectUrl(useBlackLogo);

    try {
        const logoImage = await loadImage(logoObjectUrl);
        const canvas = document.createElement('canvas');
        canvas.width = baseImage.naturalWidth;
        canvas.height = baseImage.naturalHeight;

        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Falha ao preparar canvas para exportação.');
        }

        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(baseImage, 0, 0);

        const logoWidth = Math.min(LOGO_EXPORT_WIDTH * 2, Math.max(LOGO_EXPORT_WIDTH, Math.round(canvas.width * 0.1)));
        const logoHeight = Math.round((logoImage.naturalHeight / logoImage.naturalWidth) * logoWidth);
        const panelPaddingX = Math.max(14, Math.round(canvas.width * 0.009));
        const panelPaddingY = Math.max(12, Math.round(canvas.height * 0.01));
        const lineGap = Math.max(6, Math.round(logoHeight * 0.12));
        const titleFontSize = Math.max(18, Math.round(logoHeight * 0.34));
        const metaFontSize = Math.max(14, Math.round(logoHeight * 0.24));
        const panelTextColor = useBlackLogo ? '#111111' : '#FBF5E5';
        const panelBackground = useBlackLogo ? 'rgba(255,255,255,0.82)' : 'rgba(17,17,17,0.58)';
        const panelBorder = useBlackLogo ? 'rgba(17,17,17,0.08)' : 'rgba(251,245,229,0.12)';
        const providerText = `Provider: ${providerLabel}`;
        const exportedAtText = formatExportTimestamp(exportedAt);

        context.font = `700 ${titleFontSize}px Arial`;
        const providerWidth = context.measureText(providerText).width;
        context.font = `500 ${metaFontSize}px Arial`;
        const exportedAtWidth = context.measureText(exportedAtText).width;

        const panelWidth = Math.max(logoWidth, providerWidth, exportedAtWidth) + panelPaddingX * 2;
        const panelHeight = logoHeight + titleFontSize + metaFontSize + panelPaddingY * 2 + lineGap * 2;
        const panelX = canvas.width - panelWidth - LOGO_EXPORT_MARGIN;
        const panelY = canvas.height - panelHeight - LOGO_EXPORT_MARGIN;
        const logoX = panelX + panelWidth - panelPaddingX - logoWidth;
        const logoY = panelY + panelPaddingY;

        context.fillStyle = panelBackground;
        context.strokeStyle = panelBorder;
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(panelX, panelY, panelWidth, panelHeight, 14);
        context.fill();
        context.stroke();

        context.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);

        const textRightX = panelX + panelWidth - panelPaddingX;
        let currentTextY = logoY + logoHeight + lineGap + titleFontSize;

        context.fillStyle = panelTextColor;
        context.textAlign = 'right';
        context.font = `700 ${titleFontSize}px Arial`;
        context.fillText(providerText, textRightX, currentTextY);

        currentTextY += lineGap + metaFontSize;
        context.font = `500 ${metaFontSize}px Arial`;
        context.fillText(exportedAtText, textRightX, currentTextY);
        context.textAlign = 'left';

        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(logoObjectUrl);
    }
}

function normalizeCloudAccounts(payload: unknown): OrganizationCloudAccount[] {
    const normalizedPayload = payload as CloudAccountsApiPayload;
    const items = Array.isArray(normalizedPayload) ? normalizedPayload : Array.isArray(normalizedPayload?.items) ? normalizedPayload.items : [];

    return items.filter((item): item is OrganizationCloudAccount => {
        return (
            typeof item === 'object' && item !== null && typeof item.id === 'string' && typeof item.alias === 'string' && typeof item.provider === 'string'
        );
    });
}

function normalizeAssessmentExcelJobs(payload: unknown): AssessmentExcelJob[] {
    const normalizedPayload = payload as AssessmentExcelJobsApiPayload;
    const items = Array.isArray(normalizedPayload) ? normalizedPayload : Array.isArray(normalizedPayload?.items) ? normalizedPayload.items : [];

    return items.filter((item): item is AssessmentExcelJob => {
        return typeof item === 'object' && item !== null && typeof item.id === 'string' && typeof item.status === 'string';
    });
}

function formatDateTime(value?: string): string {
    if (!value) {
        return '-';
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

function hasExcelExpired(expiresAt?: string): boolean {
    if (!expiresAt) {
        return false;
    }

    const expiresTimestamp = new Date(expiresAt).getTime();

    if (Number.isNaN(expiresTimestamp)) {
        return false;
    }

    return expiresTimestamp <= Date.now();
}

function getJobStatusLabel(status: string, t: { statusPending: string; statusRunning: string; statusCompleted: string; statusFailed: string }): string {
    if (status === 'pending') return t.statusPending;
    if (status === 'running') return t.statusRunning;
    if (status === 'completed') return t.statusCompleted;
    if (status === 'failed') return t.statusFailed;
    return status;
}

export function AssessmentPageClient() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { resolvedTheme } = useTheme();
    const ta = useTranslations('assessment');
    const tc = useTranslations('common');
    const graphWrapperRef = useRef<HTMLDivElement | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [activeCloudAccount, setActiveCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const [hasAssessmentModule, setHasAssessmentModule] = useState<boolean | null>(null);
    const [canCreateCloudAccount, setCanCreateCloudAccount] = useState<boolean | null>(null);
    const [running, setRunning] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [isExportingDiagram, setIsExportingDiagram] = useState(false);
    const [generatingExcel, setGeneratingExcel] = useState(false);
    const reportsPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [assessmentExcelJobs, setAssessmentExcelJobs] = useState<AssessmentExcelJob[]>([]);
    const [resourceNodes, setResourceNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [groupingModes, setGroupingModes] = useState<GroupingDimension[]>(() => normalizeGroupingModesFromUrl(searchParams.get(GROUP_BY_QUERY_PARAM)));
    const [hiddenResourceFilterIds, setHiddenResourceFilterIds] = useState<Set<ResourceVisibilityFilterId>>(
        () => new Set(normalizeHiddenFiltersFromUrl(searchParams.get(HIDDEN_FILTERS_QUERY_PARAM)))
    );
    const [layoutNonce, setLayoutNonce] = useState(0);

    const syncFilterStateToUrl = useCallback(
        (nextGroupingModes: GroupingDimension[], nextHiddenFilterIds: Set<ResourceVisibilityFilterId>) => {
            const params = new URLSearchParams(searchParams.toString());
            const groupedValue = nextGroupingModes.join(',');
            const hiddenFilterValues = [...nextHiddenFilterIds].sort();
            const hiddenFiltersValue = hiddenFilterValues.join(',');

            if (areStringArraysEqual(nextGroupingModes, DEFAULT_GROUPING_MODES)) {
                params.delete(GROUP_BY_QUERY_PARAM);
            } else {
                params.set(GROUP_BY_QUERY_PARAM, groupedValue);
            }

            if (areStringArraysEqual(hiddenFilterValues, [...DEFAULT_HIDDEN_FILTER_IDS].sort())) {
                params.delete(HIDDEN_FILTERS_QUERY_PARAM);
            } else if (hiddenFilterValues.length === 0) {
                params.delete(HIDDEN_FILTERS_QUERY_PARAM);
            } else {
                params.set(HIDDEN_FILTERS_QUERY_PARAM, hiddenFiltersValue);
            }

            const nextQuery = params.toString();
            const currentQuery = searchParams.toString();

            if (nextQuery === currentQuery) {
                return;
            }

            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    useEffect(() => {
        const urlGroupingModes = normalizeGroupingModesFromUrl(searchParams.get(GROUP_BY_QUERY_PARAM));
        const urlHiddenFilters = new Set(normalizeHiddenFiltersFromUrl(searchParams.get(HIDDEN_FILTERS_QUERY_PARAM)));

        setGroupingModes((current) => (areStringArraysEqual(current, urlGroupingModes) ? current : urlGroupingModes));
        setHiddenResourceFilterIds((current) => (areFilterSetsEqual(current, urlHiddenFilters) ? current : urlHiddenFilters));
    }, [searchParams]);

    useEffect(() => {
        syncFilterStateToUrl(groupingModes, hiddenResourceFilterIds);
    }, [groupingModes, hiddenResourceFilterIds, syncFilterStateToUrl]);

    const layoutedGraph = useMemo(() => {
        const layoutedNodes = autoLayout(resourceNodes, edges);
        const layoutedNodeIds = new Set(layoutedNodes.map((node) => node.id));
        const layoutedEdges = edges.filter((edge) => layoutedNodeIds.has(edge.source) && layoutedNodeIds.has(edge.target));

        return {
            resourceNodes: layoutedNodes,
            edges: layoutedEdges,
        };
    }, [edges, layoutNonce, resourceNodes]);

    const filteredGraph = useMemo(() => {
        const nodesAfterVisibilityFilter = filterNodesByVisibility(layoutedGraph.resourceNodes, hiddenResourceFilterIds);
        const visibleNodeIds = new Set(nodesAfterVisibilityFilter.map((node) => node.id));
        const edgesAfterVisibilityFilter = layoutedGraph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
        const nodesAfterOrphanRemoval = removeOrphanNodesByType(nodesAfterVisibilityFilter, edgesAfterVisibilityFilter);
        const finalNodeIds = new Set(nodesAfterOrphanRemoval.map((node) => node.id));
        const finalEdges = edgesAfterVisibilityFilter.filter((edge) => finalNodeIds.has(edge.source) && finalNodeIds.has(edge.target));

        return {
            resourceNodes: nodesAfterOrphanRemoval,
            edges: finalEdges,
        };
    }, [hiddenResourceFilterIds, layoutedGraph.edges, layoutedGraph.resourceNodes]);

    const nodes = useMemo(() => {
        if (groupingModes.length === 0) {
            return filteredGraph.resourceNodes;
        }

        return buildGroupedNodesByModes(filteredGraph.resourceNodes, filteredGraph.edges, groupingModes);
    }, [filteredGraph.edges, filteredGraph.resourceNodes, groupingModes]);

    const visualGroupCount = useMemo(() => {
        if (!filteredGraph.resourceNodes.length) {
            return 0;
        }

        if (groupingModes.length === 0) {
            return 1;
        }

        return nodes.filter((node) => node.type === 'resourceGroup').length;
    }, [filteredGraph.resourceNodes.length, groupingModes.length, nodes]);

    const toggleGroupingMode = useCallback((mode: GroupingDimension) => {
        setGroupingModes((current) => {
            return current.includes(mode) ? current.filter((value) => value !== mode) : [...current, mode];
        });
    }, []);

    const toggleResourceFilter = useCallback((filterId: ResourceVisibilityFilterId) => {
        setHiddenResourceFilterIds((current) => {
            const next = new Set(current);

            if (next.has(filterId)) {
                next.delete(filterId);
            } else {
                next.add(filterId);
            }

            return next;
        });
    }, []);

    const loadContext = useCallback(async () => {
        const nextOrganizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const nextCloudAccountId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);

        setOrganizationId(nextOrganizationId);
        setCloudAccountId(nextCloudAccountId);

        if (!nextOrganizationId) {
            setActiveCloudAccount(null);
            setHasAssessmentModule(false);
            setCanCreateCloudAccount(false);
            return;
        }

        try {
            const [sidebarResponse, cloudAccountsResponse] = await Promise.all([
                fetch('/api/sidebar/context', { cache: 'no-store' }),
                fetchOrganizationCloudAccounts(nextOrganizationId),
            ]);

            if (sidebarResponse.status === 401 || cloudAccountsResponse.status === 401) {
                toast.error(tc.sessionExpired);
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (sidebarResponse.status === 404) {
                setActiveCloudAccount(null);
                setHasAssessmentModule(false);
                setCanCreateCloudAccount(false);
                return;
            }

            if (!sidebarResponse.ok) {
                setActiveCloudAccount(null);
                setHasAssessmentModule(false);
                setCanCreateCloudAccount(false);
                return;
            }

            const sidebarPayload = (await sidebarResponse.json()) as SidebarContextPayload;
            const activeOrganization = sidebarPayload.organizations?.find((organization) => organization.id === nextOrganizationId);
            const modules = normalizePlanModules(activeOrganization?.plans ?? []);

            setHasAssessmentModule(hasModuleAccess(modules, PlanModule.ASSESSMENT));
            setCanCreateCloudAccount(canManageCloudAccounts(normalizeOrganizationRole(activeOrganization?.currentRole ?? null)));

            if (!cloudAccountsResponse.ok) {
                setActiveCloudAccount(null);
                return;
            }

            const cloudAccountsPayload = (await cloudAccountsResponse.json().catch(() => null)) as unknown;
            const cloudAccounts = normalizeCloudAccounts(cloudAccountsPayload);
            const nextActiveCloudAccount = cloudAccounts.find((account) => account.id === nextCloudAccountId) ?? null;

            setCloudAccountId(nextActiveCloudAccount?.id ?? null);
            setActiveCloudAccount(nextActiveCloudAccount);
        } catch {
            setActiveCloudAccount(null);
            setHasAssessmentModule(false);
            setCanCreateCloudAccount(false);
        }
    }, [router]);

    useEffect(() => {
        void loadContext();
    }, [loadContext]);

    useEffect(() => {
        const handleContextChange = () => {
            void loadContext();
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== ACTIVE_ORG_STORAGE_KEY && event.key !== ACTIVE_CLOUD_GLOBAL_KEY) {
                return;
            }

            void loadContext();
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
    }, [loadContext]);

    useEffect(() => {
        if (hasAssessmentModule !== false) {
            return;
        }

        toast.error(ta.moduleNotEnabled);
        router.replace('/');
    }, [hasAssessmentModule, router]);

    const activeProvider = normalizeAssessmentProvider(activeCloudAccount?.provider);
    const providerLabel = formatAssessmentProvider(activeProvider);
    const canRun = Boolean(organizationId && cloudAccountId && activeProvider !== 'unknown' && hasAssessmentModule);

    const loadAssessmentExcelJobs = useCallback(async () => {
        if (!organizationId || !cloudAccountId || activeProvider === 'unknown') {
            setAssessmentExcelJobs([]);
            return;
        }

        try {
            const response = await fetchAssessmentExcelJobs(organizationId, cloudAccountId, activeProvider);

            if (response.status === 401) {
                toast.error(tc.sessionExpired);
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (!response.ok) {
                return;
            }

            const payload = (await response.json().catch(() => null)) as unknown;
            const jobs = normalizeAssessmentExcelJobs(payload);
            setAssessmentExcelJobs(jobs);
        } catch {
            // Silencia erros de polling para evitar spam de toast.
        }
    }, [activeProvider, cloudAccountId, organizationId, router]);

    useEffect(() => {
        void loadAssessmentExcelJobs();
    }, [loadAssessmentExcelJobs]);

    useEffect(() => {
        if (reportsPollTimerRef.current) {
            clearInterval(reportsPollTimerRef.current);
            reportsPollTimerRef.current = null;
        }

        const hasActiveJob = assessmentExcelJobs.some((job) => job.status === 'pending' || job.status === 'running');

        if (!hasActiveJob) {
            return;
        }

        reportsPollTimerRef.current = setInterval(() => {
            void loadAssessmentExcelJobs();
        }, REPORTS_POLL_INTERVAL_MS);

        return () => {
            if (reportsPollTimerRef.current) {
                clearInterval(reportsPollTimerRef.current);
                reportsPollTimerRef.current = null;
            }
        };
    }, [assessmentExcelJobs, loadAssessmentExcelJobs]);

    const runAssessmentRequest = useCallback(async () => {
        if (!organizationId || !cloudAccountId) {
            toast.error(ta.selectOrgAndAccount);
            return;
        }

        if (!hasAssessmentModule) {
            toast.error(ta.moduleNotEnabled);
            return;
        }

        if (activeProvider === 'unknown') {
            toast.error(ta.providerNotFound);
            return;
        }

        setRunning(true);

        try {
            const response = await runAssessment(organizationId, cloudAccountId, activeProvider);
            const payload = (await response.json().catch(() => null)) as AssessmentGraphPayload | ApiErrorPayload | null;

            if (response.status === 401) {
                toast.error(tc.sessionExpired);
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }

            const graph = payload && typeof payload === 'object' && 'architectureGraph' in payload ? payload.architectureGraph : undefined;
            const rawNodes = normalizeNodes(graph?.nodes);
            const nextEdges = normalizeEdges(graph?.edges, rawNodes.length > 250);
            setResourceNodes(rawNodes);
            setEdges(nextEdges);
            setLayoutNonce((value) => value + 1);

            if (rawNodes.length === 0) {
                toast.warning(ta.noNodes);
            } else {
                toast.success(ta.runSuccess.replace('{provider}', providerLabel));
            }
        } catch {
            toast.error(ta.runError);
        } finally {
            setRunning(false);
        }
    }, [activeProvider, cloudAccountId, hasAssessmentModule, organizationId, providerLabel, router]);

    const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

    const subtitle = useMemo(() => {
        if (hasAssessmentModule === false) {
            return ta.moduleNotEnabled;
        }

        if (!cloudAccountId || !activeCloudAccount) {
            return ta.selectCloudSubtitle;
        }

        if (!canRun) {
            return ta.selectOrgAndCloudSubtitle;
        }

        return ta.runningSubtitle.replace('{account}', activeCloudAccount.alias).replace('{provider}', providerLabel);
    }, [activeCloudAccount, canRun, cloudAccountId, hasAssessmentModule, providerLabel, ta]);

    const reorganizeGraph = useCallback(() => {
        setLayoutNonce((value) => value + 1);
    }, []);

    const downloadDiagram = useCallback(async () => {
        if (!graphWrapperRef.current || filteredGraph.resourceNodes.length === 0) {
            return;
        }

        setDownloading(true);
        setIsExportingDiagram(true);

        try {
            // Aguarda um ciclo de render para garantir que o SVG esteja totalmente materializado.
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });

            const svgElement = graphWrapperRef.current.querySelector('.assessment-graph-svg') as SVGSVGElement | null;

            if (!svgElement) {
                toast.error(ta.exportPrepError);
                return;
            }

            const exportSvg = svgElement.cloneNode(true) as SVGSVGElement;
            const fullViewBox = svgElement.getAttribute('data-full-view-box');
            const fullWidth = svgElement.getAttribute('data-full-width');
            const fullHeight = svgElement.getAttribute('data-full-height');

            if (fullViewBox) {
                exportSvg.setAttribute('viewBox', fullViewBox);
            }

            if (fullWidth) {
                exportSvg.setAttribute('width', fullWidth);
            }

            if (fullHeight) {
                exportSvg.setAttribute('height', fullHeight);
            }

            exportSvg.removeAttribute('data-full-view-box');
            exportSvg.removeAttribute('data-full-width');
            exportSvg.removeAttribute('data-full-height');
            exportSvg.setAttribute('font-family', 'Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif');
            exportSvg.setAttribute('shape-rendering', 'geometricPrecision');
            exportSvg.setAttribute('text-rendering', 'optimizeLegibility');

            const exportColorMap = new Map<string, string>([
                ['#0b1220', 'none'],
                ['rgba(71,85,105,0.16)', 'rgba(148,163,184,0.12)'],
                ['rgba(148,163,184,0.34)', 'rgba(71,85,105,0.28)'],
                ['#0f172a', '#ffffff'],
                ['rgba(148,163,184,0.36)', 'rgba(100,116,139,0.34)'],
                ['#e2e8f0', '#0f172a'],
                ['#94a3b8', '#475569'],
            ]);

            const firstChild = exportSvg.firstElementChild;
            if (firstChild && firstChild.tagName.toLowerCase() === 'rect') {
                firstChild.remove();
            }

            exportSvg.querySelectorAll<SVGElement>('*').forEach((element) => {
                const fill = element.getAttribute('fill');
                if (fill) {
                    const nextFill = exportColorMap.get(fill.trim().toLowerCase());
                    if (nextFill) {
                        element.setAttribute('fill', nextFill);
                    }
                }

                const stroke = element.getAttribute('stroke');
                if (stroke) {
                    const nextStroke = exportColorMap.get(stroke.trim().toLowerCase());
                    if (nextStroke) {
                        element.setAttribute('stroke', nextStroke);
                    }
                }
            });

            const rawSvgMarkup = new XMLSerializer().serializeToString(exportSvg);
            const svgMarkup = rawSvgMarkup.includes('xmlns="http://www.w3.org/2000/svg"')
                ? rawSvgMarkup
                : rawSvgMarkup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            const encodedSvgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

            const exportedAt = new Date().toISOString();
            const exportResponse = await exportAssessmentDiagram({
                svgDataUrl: encodedSvgDataUrl,
                provider: activeProvider,
                exportedAt,
            });

            if (!exportResponse.ok) {
                toast.error(ta.exportError);
                return;
            }

            const blob = await exportResponse.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `assessment-diagrama-${activeProvider}-${exportedAt.slice(0, 19).replace(/:/g, '-')}.svg`;
            link.href = objectUrl;
            link.click();
            URL.revokeObjectURL(objectUrl);
            toast.success(ta.downloadSuccess);
        } catch {
            toast.error(ta.exportError);
        } finally {
            setIsExportingDiagram(false);
            setDownloading(false);
        }
    }, [activeProvider, filteredGraph.resourceNodes.length]);

    const downloadAssessmentExcel = useCallback(async () => {
        if (!organizationId || !cloudAccountId) return;

        setGeneratingExcel(true);

        try {
            const triggerRes = await triggerAssessmentExcelReport(organizationId, cloudAccountId, activeProvider);

            if (!triggerRes.ok) {
                const body = await triggerRes.json().catch(() => null);
                toast.error(extractErrorMessage(body));
                return;
            }

            toast.success(ta.reportQueued);
            await loadAssessmentExcelJobs();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : ta.reportError);
        } finally {
            setGeneratingExcel(false);
        }
    }, [activeProvider, cloudAccountId, loadAssessmentExcelJobs, organizationId]);

    const downloadExcelJob = useCallback(
        (jobId: string) => {
            if (!organizationId || !cloudAccountId) {
                return;
            }

            const downloadUrl = buildAssessmentExcelDownloadUrl(organizationId, cloudAccountId, jobId, activeProvider);
            window.location.assign(downloadUrl);
        },
        [activeProvider, cloudAccountId, organizationId]
    );

    const toolbarTitle = activeProvider === 'unknown' ? 'Assessment Multicloud' : `Assessment ${providerLabel}`;
    const groupingModeLabel = getGroupingModeLabel(groupingModes);

    if (hasAssessmentModule === null || canCreateCloudAccount === null) {
        return null;
    }

    return (
        <div className="flex flex-col gap-4">
            <AssessmentToolbar
                title={toolbarTitle}
                subtitle={subtitle}
                nodeCount={filteredGraph.resourceNodes.length}
                edgeCount={filteredGraph.edges.length}
                groupCount={visualGroupCount}
                canRun={canRun}
                canCreateCloudAccount={Boolean(canCreateCloudAccount)}
                running={running}
                downloading={downloading}
                generatingExcel={generatingExcel}
                showExcelButton={activeProvider !== 'unknown'}
                groupingModes={groupingModes}
                hiddenResourceFilterIds={hiddenResourceFilterIds}
                onRun={() => void runAssessmentRequest()}
                onReorganize={reorganizeGraph}
                onDownload={() => void downloadDiagram()}
                onExcelDownload={() => void downloadAssessmentExcel()}
                onToggleGroupingMode={toggleGroupingMode}
                onToggleResourceFilter={toggleResourceFilter}
                onConnectCloudAccount={() => router.push('/cloud-accounts/new')}
            />

            <MemoizedAssessmentGraphCard
                nodes={nodes}
                edges={filteredGraph.edges}
                groupingModeLabel={groupingModeLabel}
                colorMode={colorMode}
                isExportingDiagram={isExportingDiagram}
                graphWrapperRef={graphWrapperRef}
            />

            {activeProvider !== 'unknown' ? (
                <div className="rounded-xl border">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <div>
                            <p className="text-sm font-medium">{ta.excelQueueTitle}</p>
                            <p className="text-xs text-muted-foreground">{ta.excelQueueDesc}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => void loadAssessmentExcelJobs()}>
                            {tc.refresh}
                        </Button>
                    </div>

                    <div className="divide-y">
                        {assessmentExcelJobs.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-muted-foreground">{ta.noRecentReports}</div>
                        ) : (
                            assessmentExcelJobs.map((job) => {
                                const expired = hasExcelExpired(job.excelExpiresAt);
                                const canDownload = job.status === 'completed' && Boolean(job.excelDownloadUrl) && !expired;

                                return (
                                    <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">{getJobStatusLabel(job.status, ta)}</Badge>
                                                {job.status === 'completed' && expired ? <Badge variant="secondary">{ta.expired}</Badge> : null}
                                            </div>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</p>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(job.completedAt)}</p>
                                            <p className="text-xs text-muted-foreground">{formatDateTime(job.excelExpiresAt)}</p>
                                            {job.status === 'failed' && job.error ? <p className="text-xs text-destructive">{job.error}</p> : null}
                                        </div>
                                        <Button type="button" size="sm" onClick={() => downloadExcelJob(job.id)} disabled={!canDownload}>
                                            {ta.downloadXlsx}
                                        </Button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
