'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { getSmoothStepPath, Position, type Edge, type Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ArchitectureNodeData } from '@/components/root/assessment/types';

// Edge colour tokens — must match CSS custom properties in globals.css.
// Using var(...) references keeps the SVG in sync with the token system.
const EDGE_LEGEND = [
    { color: 'var(--chart-6)',          label: 'HTTPS e roteamento de trafego', dashed: false, animated: false },
    { color: 'var(--chart-7)',          label: 'DNS e descoberta de servico',    dashed: false, animated: false },
    { color: 'var(--chart-8)',          label: 'Conectividade de rede',          dashed: false, animated: false },
    { color: 'var(--chart-9)',          label: 'Invocacao e listener',           dashed: false, animated: false },
    { color: 'var(--chart-10)',         label: 'Servico e execucao de workload', dashed: false, animated: false },
    { color: 'var(--warning)',          label: 'Hospedagem em subnet',           dashed: false, animated: false },
    { color: 'var(--success)',          label: 'Rota principal e roteamento',    dashed: false, animated: false },
    { color: 'var(--success)',          label: 'Associacao com subnet/tabela',   dashed: true,  animated: false },
    { color: 'var(--destructive)',      label: 'Vinculo com Security Group',     dashed: true,  animated: false },
    { color: 'var(--chart-11)',         label: 'Vinculo com IAM Role',           dashed: true,  animated: false },
    { color: 'var(--muted-foreground)', label: 'Contencao e estrutura',          dashed: true,  animated: false },
] as const;

const DEFAULT_NODE_WIDTH = 230;
const DEFAULT_NODE_HEIGHT = 80;
const SVG_PADDING = 56;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.18;
const PAN_DAMPING = 0.28;
const AUTO_FIT_MIN_READABLE_ZOOM = 0.58;
const GROUP_LABEL_MAX_CHARS = 34;
const NODE_LABEL_MAX_CHARS = 28;
const NODE_TYPE_MAX_CHARS = 32;
const NODE_STATUS_MAX_CHARS = 20;

type AssessmentGraphCardProps = {
    nodes: Node[];
    edges: Edge[];
    groupingModeLabel: string;
    colorMode: 'light' | 'dark';
    graphWrapperRef: MutableRefObject<HTMLDivElement | null>;
    isExportingDiagram: boolean;
};

type ResolvedNode = {
    id: string;
    type?: string;
    label: string;
    resourceType: string;
    status?: string;
    details?: Record<string, unknown>;
    x: number;
    y: number;
    width: number;
    height: number;
};

type GraphModel = {
    viewBoxX: number;
    viewBoxY: number;
    width: number;
    height: number;
    fullViewBox: string;
    groupNodes: ResolvedNode[];
    resourceNodes: ResolvedNode[];
    edgesToDraw: Array<{
        id: string;
        path: string;
        stroke: string;
        strokeWidth: number;
        strokeDasharray?: string;
    }>;
};

type CameraState = {
    x: number;
    y: number;
    zoom: number;
};

type ContainerSize = {
    width: number;
    height: number;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function resolveNodeSize(node: Node): { width: number; height: number } {
    const style = node.style as { width?: number | string; height?: number | string } | undefined;
    const styleWidth = typeof style?.width === 'number' ? style.width : Number(style?.width);
    const styleHeight = typeof style?.height === 'number' ? style.height : Number(style?.height);

    return {
        width: node.measured?.width ?? node.width ?? (Number.isFinite(styleWidth) ? styleWidth : DEFAULT_NODE_WIDTH),
        height: node.measured?.height ?? node.height ?? (Number.isFinite(styleHeight) ? styleHeight : DEFAULT_NODE_HEIGHT),
    };
}

function resolveNodes(nodes: Node[]): ResolvedNode[] {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const resolvedPositions = new Map<string, { x: number; y: number }>();

    const resolvePosition = (node: Node): { x: number; y: number } => {
        const cached = resolvedPositions.get(node.id);
        if (cached) {
            return cached;
        }

        const own = { x: node.position?.x ?? 0, y: node.position?.y ?? 0 };
        if (!node.parentId) {
            resolvedPositions.set(node.id, own);
            return own;
        }

        const parent = nodesById.get(node.parentId);
        if (!parent) {
            resolvedPositions.set(node.id, own);
            return own;
        }

        const parentPos = resolvePosition(parent);
        const absolute = { x: parentPos.x + own.x, y: parentPos.y + own.y };
        resolvedPositions.set(node.id, absolute);
        return absolute;
    };

    return nodes.map((node) => {
        const size = resolveNodeSize(node);
        const absolute = resolvePosition(node);
        const data = (node.data ?? {}) as ArchitectureNodeData;

        return {
            id: node.id,
            type: node.type,
            label: data.label ?? 'Resource',
            resourceType: data.resourceType ?? 'Unknown',
            status: data.status,
            details: data.details,
            x: absolute.x,
            y: absolute.y,
            width: size.width,
            height: size.height,
        };
    });
}

function buildEdgePath(source: ResolvedNode, target: ResolvedNode): string {
    const sourceCenterX = source.x + source.width / 2;
    const sourceCenterY = source.y + source.height / 2;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;

    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;
    let sourceX: number;
    let sourceY: number;
    let targetX: number;
    let targetY: number;
    let sourcePosition: Position;
    let targetPosition: Position;

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        if (deltaX >= 0) {
            sourcePosition = Position.Right;
            targetPosition = Position.Left;
            sourceX = source.x + source.width;
            sourceY = sourceCenterY;
            targetX = target.x;
            targetY = targetCenterY;
        } else {
            sourcePosition = Position.Left;
            targetPosition = Position.Right;
            sourceX = source.x;
            sourceY = sourceCenterY;
            targetX = target.x + target.width;
            targetY = targetCenterY;
        }
    } else if (deltaY >= 0) {
        sourcePosition = Position.Bottom;
        targetPosition = Position.Top;
        sourceX = sourceCenterX;
        sourceY = source.y + source.height;
        targetX = targetCenterX;
        targetY = target.y;
    } else {
        sourcePosition = Position.Top;
        targetPosition = Position.Bottom;
        sourceX = sourceCenterX;
        sourceY = source.y;
        targetX = targetCenterX;
        targetY = target.y + target.height;
    }

    const [path] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 10,
        offset: 18,
    });

    return path;
}

function truncateText(value: string | undefined, maxChars: number): string {
    if (!value) return '';
    if (value.length <= maxChars) return value;
    if (maxChars <= 1) return '…';
    return `${value.slice(0, maxChars - 1)}…`;
}

function resolveThemePalette(colorMode: 'light' | 'dark') {
    if (colorMode === 'dark') {
        return {
            svgBackground: '#0b1220',
            groupFill: 'rgba(71,85,105,0.16)',
            groupStroke: 'rgba(148,163,184,0.34)',
            nodeFill: '#0f172a',
            nodeStroke: 'rgba(148,163,184,0.36)',
            nodeStrokeSelected: '#60a5fa',
            textColor: '#e2e8f0',
            subtextColor: '#94a3b8',
        };
    }

    return {
        svgBackground: '#f8fafc',
        groupFill: 'rgba(148,163,184,0.12)',
        groupStroke: 'rgba(71,85,105,0.28)',
        nodeFill: '#ffffff',
        nodeStroke: 'rgba(100,116,139,0.34)',
        nodeStrokeSelected: '#2563eb',
        textColor: '#0f172a',
        subtextColor: '#475569',
    };
}

export function AssessmentGraphCard({ nodes, edges, groupingModeLabel, colorMode, graphWrapperRef, isExportingDiagram }: AssessmentGraphCardProps) {
    const isLargeGraph = nodes.length > 200;
    const isVeryLargeGraph = nodes.length > 500;
    const isUltraLargeGraph = nodes.length > 1000;

    const palette = useMemo(() => resolveThemePalette(colorMode), [colorMode]);
    const resolvedNodes = useMemo(() => resolveNodes(nodes), [nodes]);

    const renderedEdges = useMemo(() => {
        if (isUltraLargeGraph) {
            return edges
                .filter((edge) => {
                    const rel = (edge.data?.relationship as string)?.toLowerCase() ?? '';
                    return !(rel.includes('contains') || rel.includes('has-security-group') || rel.includes('has-route-table'));
                })
                .map((edge) => (edge.animated ? { ...edge, animated: false } : edge));
        }

        return edges.map((edge) => (edge.animated ? { ...edge, animated: false } : edge));
    }, [edges, isUltraLargeGraph]);

    const graphModel = useMemo<GraphModel | null>(() => {
        if (!resolvedNodes.length) {
            return null;
        }

        const nodeById = new Map(resolvedNodes.map((node) => [node.id, node]));

        const nodeBounds = resolvedNodes.reduce(
            (acc, node) => ({
                minX: Math.min(acc.minX, node.x),
                minY: Math.min(acc.minY, node.y),
                maxX: Math.max(acc.maxX, node.x + node.width),
                maxY: Math.max(acc.maxY, node.y + node.height),
            }),
            {
                minX: Number.POSITIVE_INFINITY,
                minY: Number.POSITIVE_INFINITY,
                maxX: Number.NEGATIVE_INFINITY,
                maxY: Number.NEGATIVE_INFINITY,
            }
        );

        const viewBoxX = nodeBounds.minX - SVG_PADDING;
        const viewBoxY = nodeBounds.minY - SVG_PADDING;
        const width = Math.max(1000, nodeBounds.maxX - nodeBounds.minX + SVG_PADDING * 2);
        const height = Math.max(700, nodeBounds.maxY - nodeBounds.minY + SVG_PADDING * 2);

        const edgesToDraw = renderedEdges.flatMap((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);

            if (!source || !target || source.type === 'resourceGroup' || target.type === 'resourceGroup') {
                return [];
            }

            const style = edge.style as { stroke?: string; strokeWidth?: number | string; strokeDasharray?: string } | undefined;
            const strokeDasharray = style?.strokeDasharray;

            return [
                {
                    id: edge.id,
                    path: buildEdgePath(source, target),
                    stroke: style?.stroke ?? 'var(--muted-foreground)',
                    strokeWidth: Number(style?.strokeWidth) || 1.5,
                    ...(strokeDasharray ? { strokeDasharray } : {}),
                },
            ];
        });

        return {
            viewBoxX,
            viewBoxY,
            width,
            height,
            fullViewBox: `${viewBoxX} ${viewBoxY} ${width} ${height}`,
            groupNodes: resolvedNodes.filter((node) => node.type === 'resourceGroup'),
            resourceNodes: resolvedNodes.filter((node) => node.type !== 'resourceGroup'),
            edgesToDraw,
        };
    }, [renderedEdges, resolvedNodes]);

    const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });
    const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });

    const svgRef = useRef<SVGSVGElement | null>(null);
    const draggingRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startCameraX: number;
        startCameraY: number;
        startZoom: number;
    } | null>(null);
    const didDragRef = useRef(false);

    useEffect(() => {
        const element = graphWrapperRef.current;
        if (!element) {
            return;
        }

        const updateContainerSize = () => {
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return;
            }

            setContainerSize((current) => {
                if (Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5) {
                    return current;
                }

                return { width: rect.width, height: rect.height };
            });
        };

        updateContainerSize();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateContainerSize);
            return () => {
                window.removeEventListener('resize', updateContainerSize);
            };
        }

        const observer = new ResizeObserver(() => {
            updateContainerSize();
        });

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [graphWrapperRef, nodes.length, graphModel]);

    const clampCamera = useCallback(
        (next: CameraState): CameraState => {
            if (!graphModel || containerSize.width <= 0 || containerSize.height <= 0) {
                return next;
            }

            const zoom = clamp(next.zoom, MIN_ZOOM, MAX_ZOOM);
            const viewWidth = containerSize.width / zoom;
            const viewHeight = containerSize.height / zoom;

            const centerX = graphModel.viewBoxX + graphModel.width / 2 - viewWidth / 2;
            const centerY = graphModel.viewBoxY + graphModel.height / 2 - viewHeight / 2;

            const panAllowanceX = Math.max(viewWidth * 0.25, Math.abs(viewWidth - graphModel.width) * 0.5);
            const panAllowanceY = Math.max(viewHeight * 0.25, Math.abs(viewHeight - graphModel.height) * 0.5);

            return {
                x: clamp(next.x, centerX - panAllowanceX, centerX + panAllowanceX),
                y: clamp(next.y, centerY - panAllowanceY, centerY + panAllowanceY),
                zoom,
            };
        },
        [containerSize.height, containerSize.width, graphModel]
    );

    const fitView = useCallback(
        (enforceReadableZoom: boolean, alignTopLeft = false) => {
            if (!graphModel || containerSize.width <= 0 || containerSize.height <= 0) {
                return;
            }

            const widthRatio = containerSize.width / graphModel.width;
            const heightRatio = containerSize.height / graphModel.height;
            let fitZoom = clamp(Math.min(widthRatio, heightRatio), MIN_ZOOM, MAX_ZOOM);

            if (enforceReadableZoom) {
                fitZoom = Math.max(fitZoom, AUTO_FIT_MIN_READABLE_ZOOM);
            }

            const viewWidth = containerSize.width / fitZoom;
            const viewHeight = containerSize.height / fitZoom;

            const baseX = alignTopLeft ? graphModel.viewBoxX : graphModel.viewBoxX + (graphModel.width - viewWidth) / 2;
            const baseY = alignTopLeft ? graphModel.viewBoxY : graphModel.viewBoxY + (graphModel.height - viewHeight) / 2;

            setCamera(
                clampCamera({
                    x: baseX,
                    y: baseY,
                    zoom: fitZoom,
                })
            );
        },
        [clampCamera, containerSize.height, containerSize.width, graphModel]
    );

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            fitView(true, true);
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [edges.length, fitView, nodes.length]);

    const viewBox = useMemo(() => {
        if (!graphModel || containerSize.width <= 0 || containerSize.height <= 0) {
            return {
                text: graphModel?.fullViewBox ?? '0 0 1200 720',
                x: graphModel?.viewBoxX ?? 0,
                y: graphModel?.viewBoxY ?? 0,
                width: graphModel?.width ?? 1200,
                height: graphModel?.height ?? 720,
            };
        }

        const next = clampCamera(camera);
        const width = containerSize.width / next.zoom;
        const height = containerSize.height / next.zoom;

        return {
            text: `${next.x} ${next.y} ${width} ${height}`,
            x: next.x,
            y: next.y,
            width,
            height,
        };
    }, [camera, clampCamera, containerSize.height, containerSize.width, graphModel]);

    const zoomAtPoint = useCallback(
        (delta: number, clientX?: number, clientY?: number) => {
            setCamera((current) => {
                const nextZoom = clamp(Number((current.zoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
                if (nextZoom === current.zoom) {
                    return current;
                }

                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect || rect.width <= 0 || rect.height <= 0 || clientX === undefined || clientY === undefined) {
                    const centerX = containerSize.width / 2;
                    const centerY = containerSize.height / 2;
                    const graphCenterX = current.x + centerX / current.zoom;
                    const graphCenterY = current.y + centerY / current.zoom;

                    return clampCamera({
                        x: graphCenterX - centerX / nextZoom,
                        y: graphCenterY - centerY / nextZoom,
                        zoom: nextZoom,
                    });
                }

                const localX = clientX - rect.left;
                const localY = clientY - rect.top;
                const graphX = current.x + localX / current.zoom;
                const graphY = current.y + localY / current.zoom;

                return clampCamera({
                    x: graphX - localX / nextZoom,
                    y: graphY - localY / nextZoom,
                    zoom: nextZoom,
                });
            });
        },
        [clampCamera, containerSize.height, containerSize.width]
    );

    const handleWheel = useCallback(
        (event: React.WheelEvent<SVGSVGElement>) => {
            event.preventDefault();
            event.stopPropagation();

            const modeFactor = event.deltaMode === 1 ? 14 : event.deltaMode === 2 ? 120 : 1;
            const normalizedDelta = event.deltaY * modeFactor;
            const delta = normalizedDelta < 0 ? ZOOM_STEP : -ZOOM_STEP;
            zoomAtPoint(delta, event.clientX, event.clientY);
        },
        [zoomAtPoint]
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            if (event.button !== 0) {
                return;
            }

            draggingRef.current = {
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startCameraX: camera.x,
                startCameraY: camera.y,
                startZoom: camera.zoom,
            };
            didDragRef.current = false;

            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [camera.x, camera.y, camera.zoom]
    );

    const handlePointerMove = useCallback(
        (event: React.PointerEvent<SVGSVGElement>) => {
            const drag = draggingRef.current;
            if (!drag || drag.pointerId !== event.pointerId || !graphModel) {
                return;
            }

            const svg = svgRef.current;
            if (!svg) {
                return;
            }

            const rect = svg.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return;
            }

            const unitX = graphModel.width / rect.width;
            const unitY = graphModel.height / rect.height;
            const deltaX = (event.clientX - drag.startClientX) * unitX;
            const deltaY = (event.clientY - drag.startClientY) * unitY;

            if (!didDragRef.current) {
                const movedX = Math.abs(event.clientX - drag.startClientX);
                const movedY = Math.abs(event.clientY - drag.startClientY);
                if (movedX > 4 || movedY > 4) {
                    didDragRef.current = true;
                }
            }

            setCamera((current) =>
                clampCamera({
                    x: drag.startCameraX - (deltaX / drag.startZoom) * PAN_DAMPING,
                    y: drag.startCameraY - (deltaY / drag.startZoom) * PAN_DAMPING,
                    zoom: current.zoom,
                })
            );
        },
        [clampCamera, graphModel]
    );

    const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
        if (draggingRef.current?.pointerId !== event.pointerId) {
            return;
        }

        draggingRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    }, []);

    const handleNodeClick = useCallback(() => {
        if (didDragRef.current) {
            didDragRef.current = false;
        }
    }, []);

    return (
        <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Grafo da arquitetura</p>
                <p className="text-xs text-muted-foreground">Visualizacao em SVG com zoom, pan, fit view e leitura simplificada de conexoes.</p>
            </div>

            <div className="p-4">
                {nodes.length === 0 ? (
                    <div className="flex min-h-130 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                        Rode o assessment para montar o grafo.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <Badge variant="secondary">Layout automatico com Dagre</Badge>
                                    <Badge variant="secondary">Agrupamento: {groupingModeLabel}</Badge>
                                    <Badge variant="secondary">SVG interativo (sem React Flow)</Badge>
                                    <Badge variant="secondary">Conexoes visiveis: {graphModel?.edgesToDraw.length ?? 0}</Badge>
                                    {isLargeGraph ? <Badge variant="secondary">Renderizacao otimizada (&gt;200 nos)</Badge> : null}
                                    {isVeryLargeGraph ? <Badge variant="secondary">Modo estavel (&gt;500 nos)</Badge> : null}
                                    {isUltraLargeGraph ? <Badge variant="secondary">Modo ultra (&gt;1000 nos)</Badge> : null}
                                </div>
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                    Leitura rapida: caixas pontilhadas representam grupos, linhas continuas mostram fluxo principal e linhas tracejadas
                                    mostram relacoes estruturais.
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Cada conexao mostra um ponto na origem e uma seta no destino para facilitar a leitura da direcao.
                                </p>
                            </div>

                            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                                <div>
                                    <p className="text-xs font-medium text-foreground">Legenda de conexoes</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        Cores dinamicas representam tipos de vinculo; linhas continuas indicam fluxo e tracejadas indicam estrutura.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div>
                                        <p className="mb-1 text-[11px] font-medium text-foreground/90">Fluxo principal</p>
                                        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {EDGE_LEGEND.filter((entry) => !entry.dashed).map((entry) => (
                                                <span key={entry.label} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="relative flex h-3 w-8 items-center">
                                                        <span
                                                            className="absolute inset-0 rounded-full"
                                                            style={{
                                                                height: 2,
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                background: entry.color,
                                                                borderRadius: 99,
                                                                opacity: entry.animated ? 1 : 0.85,
                                                            }}
                                                        />
                                                    </span>
                                                    {entry.label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-1 text-[11px] font-medium text-foreground/90">Relacoes estruturais</p>
                                        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {EDGE_LEGEND.filter((entry) => entry.dashed).map((entry) => (
                                                <span key={entry.label} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="relative flex h-3 w-8 items-center">
                                                        <span
                                                            className="absolute inset-0 rounded-full"
                                                            style={{
                                                                height: 0,
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                background: 'none',
                                                                borderTop: `2px dashed ${entry.color}`,
                                                                borderRadius: 99,
                                                            }}
                                                        />
                                                    </span>
                                                    {entry.label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div
                                ref={graphWrapperRef}
                                className="relative h-[72vh] min-h-130 w-full overflow-hidden rounded-xl border border-border/80 bg-linear-to-b from-muted/25 to-background"
                            >
                                <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg border bg-background/90 p-1.5 shadow-sm backdrop-blur">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => zoomAtPoint(-ZOOM_STEP)}
                                        disabled={camera.zoom <= MIN_ZOOM || isExportingDiagram}
                                    >
                                        -
                                    </Button>
                                    <span className="min-w-14 text-center text-xs font-medium">{Math.round(camera.zoom * 100)}%</span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => zoomAtPoint(ZOOM_STEP)}
                                        disabled={camera.zoom >= MAX_ZOOM || isExportingDiagram}
                                    >
                                        +
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={() => fitView(false)} disabled={isExportingDiagram}>
                                        Ajustar
                                    </Button>
                                </div>

                                {graphModel ? (
                                    <svg
                                        ref={svgRef}
                                        className="assessment-graph-svg block h-full w-full touch-none select-none"
                                        viewBox={viewBox.text}
                                        data-full-view-box={graphModel.fullViewBox}
                                        data-full-width={String(graphModel.width)}
                                        data-full-height={String(graphModel.height)}
                                        width="100%"
                                        height="100%"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fontFamily="Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
                                        shapeRendering="geometricPrecision"
                                        textRendering="optimizeLegibility"
                                        preserveAspectRatio="xMidYMid meet"
                                        onWheelCapture={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                        }}
                                        onWheel={handleWheel}
                                        onPointerDown={handlePointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerCancel={handlePointerUp}
                                    >
                                        <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill={palette.svgBackground} />

                                        <defs>
                                            <marker
                                                id="assessment-edge-source"
                                                viewBox="0 0 8 8"
                                                refX="4"
                                                refY="4"
                                                markerWidth="3.5"
                                                markerHeight="3.5"
                                                markerUnits="strokeWidth"
                                                orient="auto"
                                            >
                                                <circle cx="4" cy="4" r="2.2" fill="context-stroke" />
                                            </marker>
                                            <marker
                                                id="assessment-edge-arrow"
                                                viewBox="0 0 8 8"
                                                refX="6.6"
                                                refY="4"
                                                markerWidth="4"
                                                markerHeight="4"
                                                markerUnits="strokeWidth"
                                                orient="auto-start-reverse"
                                            >
                                                <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
                                            </marker>
                                        </defs>

                                        <g>
                                            {graphModel.groupNodes.map((node) => (
                                                <g key={node.id}>
                                                    <rect
                                                        x={node.x}
                                                        y={node.y}
                                                        width={node.width}
                                                        height={node.height}
                                                        rx={18}
                                                        ry={18}
                                                        fill={palette.groupFill}
                                                        stroke={palette.groupStroke}
                                                        strokeWidth={1.2}
                                                        strokeDasharray="5 5"
                                                    />
                                                    <text
                                                        x={node.x + 14}
                                                        y={node.y + 24}
                                                        fill={palette.textColor}
                                                        fontSize={11}
                                                        fontWeight={700}
                                                        letterSpacing={1}
                                                    >
                                                        {truncateText(node.label.toUpperCase(), GROUP_LABEL_MAX_CHARS)}
                                                    </text>
                                                </g>
                                            ))}
                                        </g>

                                        <g fill="none" strokeLinecap="round">
                                            {graphModel.edgesToDraw.map((edge) => (
                                                <path
                                                    key={edge.id}
                                                    d={edge.path}
                                                    stroke={edge.stroke}
                                                    strokeWidth={edge.strokeWidth + 0.15}
                                                    strokeDasharray={edge.strokeDasharray}
                                                    vectorEffect="non-scaling-stroke"
                                                    opacity={edge.strokeDasharray ? 0.74 : 0.9}
                                                    markerStart="url(#assessment-edge-source)"
                                                    markerEnd="url(#assessment-edge-arrow)"
                                                    strokeLinejoin="round"
                                                    strokeLinecap="round"
                                                />
                                            ))}
                                        </g>

                                        <g>
                                            {graphModel.resourceNodes.map((node) => {
                                                const normalizedStatus = node.status?.toLowerCase() ?? '';
                                                const statusColor =
                                                    normalizedStatus === 'running' || normalizedStatus === 'active'
                                                        ? '#22c55e'
                                                        : normalizedStatus
                                                          ? '#f59e0b'
                                                          : '#64748b';
                                                return (
                                                    <g key={node.id} onClick={handleNodeClick} className="cursor-default" data-node="true">
                                                        <rect
                                                            x={node.x}
                                                            y={node.y}
                                                            width={node.width}
                                                            height={node.height}
                                                            rx={12}
                                                            ry={12}
                                                            fill={palette.nodeFill}
                                                            stroke={palette.nodeStroke}
                                                            strokeWidth={1.2}
                                                        />
                                                        <circle
                                                            cx={node.x}
                                                            cy={node.y + node.height / 2}
                                                            r={3.2}
                                                            fill={palette.nodeStroke}
                                                            opacity={0.65}
                                                        />
                                                        <circle
                                                            cx={node.x + node.width}
                                                            cy={node.y + node.height / 2}
                                                            r={3.2}
                                                            fill={palette.nodeStroke}
                                                            opacity={0.65}
                                                        />
                                                        <text x={node.x + 12} y={node.y + 28} fill={palette.textColor} fontSize={12} fontWeight={700}>
                                                            {truncateText(node.label, NODE_LABEL_MAX_CHARS)}
                                                        </text>
                                                        <text x={node.x + 12} y={node.y + 47} fill={palette.subtextColor} fontSize={10} fontWeight={500}>
                                                            {truncateText(node.resourceType, NODE_TYPE_MAX_CHARS)}
                                                        </text>
                                                        {node.status ? (
                                                            <g>
                                                                <circle cx={node.x + 13} cy={node.y + 64} r={4} fill={statusColor} />
                                                                <text
                                                                    x={node.x + 22}
                                                                    y={node.y + 68}
                                                                    fill={palette.subtextColor}
                                                                    fontSize={9}
                                                                    fontWeight={600}
                                                                >
                                                                    {truncateText(node.status, NODE_STATUS_MAX_CHARS)}
                                                                </text>
                                                            </g>
                                                        ) : null}
                                                    </g>
                                                );
                                            })}
                                        </g>
                                    </svg>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export const MemoizedAssessmentGraphCard = memo(AssessmentGraphCard);
