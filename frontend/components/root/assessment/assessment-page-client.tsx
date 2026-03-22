'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toPng } from 'html-to-image';
import { getViewportForBounds } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { runAssessment } from '@/app/actions/assessment';
import { fetchOrganizationCloudAccounts, type OrganizationCloudAccount } from '@/app/actions/organization';
import { AssessmentGraphCard } from '@/components/root/assessment/assessment-graph-card';
import { AssessmentToolbar, getGroupingModeLabel } from '@/components/root/assessment/assessment-toolbar';
import {
    autoLayout,
    buildGroupedNodes,
    filterNodesByVisibility,
    formatAssessmentProvider,
    normalizeAssessmentProvider,
    normalizeEdges,
    normalizeNodes,
    removeOrphanNodesByType,
} from '@/components/root/assessment/assessment-graph-utils';
import type { AssessmentGraphPayload, GroupingMode, ResourceVisibilityFilterId, SidebarContextPayload } from '@/components/root/assessment/types';
import { extractErrorMessage } from '@/lib/error-messages';
import { hasModuleAccess, normalizePlanModules, PlanModule } from '@/lib/modules';
import { canManageCloudAccounts, normalizeOrganizationRole } from '@/lib/organization-rbac';
import {
    ACTIVE_CLOUD_ACCOUNT_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    SIDEBAR_CONTEXT_UPDATED_EVENT,
} from '@/lib/sidebar-context';

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

type NodeBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 86;
const EXPORT_PADDING = 80;
const MIN_EXPORT_WIDTH = 1200;
const MIN_EXPORT_HEIGHT = 720;
const MAX_EXPORT_SIZE = 12000;
const LOGO_EXPORT_WIDTH = 132;
const LOGO_EXPORT_MARGIN = 28;

function formatExportTimestamp(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(date);
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

export function AssessmentPageClient() {
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    const graphWrapperRef = useRef<HTMLDivElement | null>(null);
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [activeCloudAccount, setActiveCloudAccount] = useState<OrganizationCloudAccount | null>(null);
    const [hasAssessmentModule, setHasAssessmentModule] = useState<boolean | null>(null);
    const [canCreateCloudAccount, setCanCreateCloudAccount] = useState<boolean | null>(null);
    const [running, setRunning] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [resourceNodes, setResourceNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [groupingMode, setGroupingMode] = useState<GroupingMode>('resourceType');
    const [hiddenResourceFilterIds, setHiddenResourceFilterIds] = useState<Set<ResourceVisibilityFilterId>>(new Set(['securityGroups']));
    const [layoutNonce, setLayoutNonce] = useState(0);

    const filteredGraph = useMemo(() => {
        const nodesAfterVisibilityFilter = filterNodesByVisibility(resourceNodes, hiddenResourceFilterIds);
        const visibleNodeIds = new Set(nodesAfterVisibilityFilter.map((node) => node.id));
        const edgesAfterVisibilityFilter = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
        const nodesAfterOrphanRemoval = removeOrphanNodesByType(nodesAfterVisibilityFilter, edgesAfterVisibilityFilter);
        const finalNodeIds = new Set(nodesAfterOrphanRemoval.map((node) => node.id));
        const finalEdges = edgesAfterVisibilityFilter.filter((edge) => finalNodeIds.has(edge.source) && finalNodeIds.has(edge.target));

        return {
            resourceNodes: autoLayout(nodesAfterOrphanRemoval, finalEdges),
            edges: finalEdges,
        };
    }, [edges, hiddenResourceFilterIds, layoutNonce, resourceNodes]);

    const nodes = useMemo(
        () => buildGroupedNodes(filteredGraph.resourceNodes, filteredGraph.edges, groupingMode),
        [filteredGraph.edges, filteredGraph.resourceNodes, groupingMode]
    );

    const visualGroupCount = useMemo(() => {
        if (!filteredGraph.resourceNodes.length) {
            return 0;
        }

        if (groupingMode === 'none') {
            return 1;
        }

        return nodes.filter((node) => node.type === 'resourceGroup').length;
    }, [filteredGraph.resourceNodes.length, groupingMode, nodes]);

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
                toast.error('Sua sessão expirou. Faça login novamente.');
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

        toast.error('O módulo de assessment não está habilitado para a organização ativa.');
        router.replace('/');
    }, [hasAssessmentModule, router]);

    const activeProvider = normalizeAssessmentProvider(activeCloudAccount?.provider);
    const providerLabel = formatAssessmentProvider(activeProvider);
    const canRun = Boolean(organizationId && cloudAccountId && activeProvider !== 'unknown' && hasAssessmentModule);

    const runAssessmentRequest = useCallback(async () => {
        if (!organizationId || !cloudAccountId) {
            toast.error('Selecione organização e cloud account para executar o assessment.');
            return;
        }

        if (!hasAssessmentModule) {
            toast.error('O módulo de assessment não está habilitado para a organização ativa.');
            return;
        }

        if (activeProvider === 'unknown') {
            toast.error('Não foi possível identificar o provider da cloud account ativa.');
            return;
        }

        setRunning(true);

        try {
            const response = await runAssessment(organizationId, cloudAccountId, activeProvider);
            const payload = (await response.json().catch(() => null)) as AssessmentGraphPayload | ApiErrorPayload | null;

            if (response.status === 401) {
                toast.error('Sua sessão expirou. Faça login novamente.');
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return;
            }

            const graph = payload && typeof payload === 'object' && 'architectureGraph' in payload ? payload.architectureGraph : undefined;
            const rawNodes = normalizeNodes(graph?.nodes);
            const nextEdges = normalizeEdges(graph?.edges);
            setResourceNodes(rawNodes);
            setEdges(nextEdges);
            setLayoutNonce((value) => value + 1);

            if (rawNodes.length === 0) {
                toast.warning('Assessment concluído, mas sem nós para exibir no grafo.');
            } else {
                toast.success(`Assessment ${providerLabel} executado com sucesso.`);
            }
        } catch {
            toast.error('Falha ao executar assessment.');
        } finally {
            setRunning(false);
        }
    }, [activeProvider, cloudAccountId, hasAssessmentModule, organizationId, providerLabel, router]);

    const subtitle = useMemo(() => {
        if (hasAssessmentModule === false) {
            return 'O módulo de assessment não está habilitado para a organização ativa.';
        }

        if (!cloudAccountId || !activeCloudAccount) {
            return 'Selecione uma cloud account na sidebar para habilitar o assessment.';
        }

        if (!canRun) {
            return 'Selecione uma organização e uma cloud account válidas na sidebar para habilitar o assessment.';
        }

        return `Execute o assessment para gerar e visualizar o grafo de arquitetura da conta ${activeCloudAccount.alias} em ${providerLabel}.`;
    }, [activeCloudAccount, canRun, cloudAccountId, hasAssessmentModule, providerLabel]);

    const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light';

    const reorganizeGraph = useCallback(() => {
        setLayoutNonce((value) => value + 1);
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

    const downloadDiagram = useCallback(async () => {
        if (!graphWrapperRef.current || filteredGraph.resourceNodes.length === 0) {
            return;
        }

        setDownloading(true);

        try {
            const viewportElement = graphWrapperRef.current.querySelector('.react-flow__viewport') as HTMLElement | null;
            const bounds = getAbsoluteNodeBounds(nodes);

            if (!viewportElement || !bounds) {
                toast.error('Não foi possível preparar o diagrama para exportação.');
                return;
            }

            const backgroundColor = getComputedStyle(document.body).backgroundColor;
            const exportWidth = Math.min(Math.max(Math.ceil(bounds.width + EXPORT_PADDING * 2), MIN_EXPORT_WIDTH), MAX_EXPORT_SIZE);
            const exportHeight = Math.min(Math.max(Math.ceil(bounds.height + EXPORT_PADDING * 2), MIN_EXPORT_HEIGHT), MAX_EXPORT_SIZE);
            const viewport = getViewportForBounds(bounds, exportWidth, exportHeight, 0.1, 1.5, 0.06);

            const rawDataUrl = await toPng(viewportElement, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor,
                skipFonts: true,
                width: exportWidth,
                height: exportHeight,
                canvasWidth: exportWidth,
                canvasHeight: exportHeight,
                style: {
                    width: `${exportWidth}px`,
                    height: `${exportHeight}px`,
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                    transformOrigin: 'top left',
                },
            });
            const dataUrl = await composeExportWithLogo(rawDataUrl, colorMode === 'light', backgroundColor, providerLabel, new Date());

            const link = document.createElement('a');
            link.download = `assessment-diagrama-${activeProvider}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
            link.href = dataUrl;
            link.click();
            toast.success('Diagrama baixado com sucesso.');
        } catch {
            toast.error('Não foi possível baixar o diagrama.');
        } finally {
            setDownloading(false);
        }
    }, [activeProvider, colorMode, filteredGraph.resourceNodes.length, nodes, providerLabel]);

    const toolbarTitle = activeProvider === 'unknown' ? 'Assessment Multicloud' : `Assessment ${providerLabel}`;
    const groupingModeLabel = getGroupingModeLabel(groupingMode);

    if (hasAssessmentModule === null || canCreateCloudAccount === null) {
        return null;
    }

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Assessment</h1>
                <p className="text-sm text-muted-foreground">
                    Execute análises de arquitetura para AWS e Azure e visualize o grafo com agrupamentos mais densos.
                </p>
            </div>

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
                groupingMode={groupingMode}
                hiddenResourceFilterIds={hiddenResourceFilterIds}
                onRun={() => void runAssessmentRequest()}
                onReorganize={reorganizeGraph}
                onDownload={() => void downloadDiagram()}
                onGroupingModeChange={setGroupingMode}
                onToggleResourceFilter={toggleResourceFilter}
                onConnectCloudAccount={() => router.push('/cloud-accounts/new')}
            />

            <AssessmentGraphCard
                nodes={nodes}
                edges={filteredGraph.edges}
                groupingModeLabel={groupingModeLabel}
                colorMode={colorMode}
                graphWrapperRef={graphWrapperRef}
            />
        </div>
    );
}
