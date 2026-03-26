'use client';

import type { MutableRefObject } from 'react';
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { assessmentNodeTypes } from '@/components/root/assessment/assessment-graph-nodes';

const EDGE_LEGEND = [
    { color: '#06b6d4', label: 'HTTPS / Tráfego roteado', dashed: false, animated: true },
    { color: '#8b5cf6', label: 'DNS', dashed: false, animated: true },
    { color: '#3b82f6', label: 'Rede', dashed: false, animated: true },
    { color: '#f97316', label: 'Invoke / Listener', dashed: false, animated: true },
    { color: '#a855f7', label: 'ECS / Serviço', dashed: false, animated: true },
    { color: '#f59e0b', label: 'Hospedagem (subnet → recurso)', dashed: false, animated: false },
    { color: '#10b981', label: 'Roteamento / Tabela de rotas', dashed: true, animated: false },
    { color: '#ef4444', label: 'Security Group', dashed: true, animated: false },
    { color: '#ec4899', label: 'IAM Role', dashed: true, animated: false },
    { color: '#64748b', label: 'Contenção / Estrutura', dashed: true, animated: false },
] as const;

const DEFAULT_EDGE_OPTIONS = { zIndex: 0, type: 'smoothstep' } as const;

type AssessmentGraphCardProps = {
    nodes: Node[];
    edges: Edge[];
    groupingModeLabel: string;
    colorMode: 'light' | 'dark';
    graphWrapperRef: MutableRefObject<HTMLDivElement | null>;
};

export function AssessmentGraphCard({ nodes, edges, groupingModeLabel, colorMode, graphWrapperRef }: AssessmentGraphCardProps) {
    const isLargeGraph = nodes.length > 450;

    return (
        <div className="rounded-xl border">
            <div className="border-b px-4 py-3">
                <p className="text-sm font-medium">Grafo da arquitetura</p>
                <p className="text-xs text-muted-foreground">
                    Visualização carregada após a execução do assessment, com organização visual por múltiplos critérios.
                </p>
            </div>

            <div className="p-4">
                {nodes.length === 0 ? (
                    <div className="flex min-h-130 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                        Rode o assessment para montar o grafo.
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">Layout automático com Dagre</Badge>
                            <Badge variant="secondary">Agrupamento: {groupingModeLabel}</Badge>
                            <Badge variant="secondary">Pan e zoom habilitados</Badge>
                            {isLargeGraph ? <Badge variant="secondary">Mini mapa ocultado para otimizar renderização</Badge> : null}
                        </div>

                        {/* Edge legend */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                            {EDGE_LEGEND.map((entry) => (
                                <span key={entry.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
                                                ...(entry.dashed
                                                    ? {
                                                          background: 'none',
                                                          borderTop: `2px dashed ${entry.color}`,
                                                          height: 0,
                                                      }
                                                    : {}),
                                            }}
                                        />
                                    </span>
                                    {entry.label}
                                </span>
                            ))}
                        </div>

                        <div
                            ref={graphWrapperRef}
                            className="h-[72vh] min-h-130 w-full overflow-hidden rounded-xl border border-border/80 bg-linear-to-b from-muted/25 to-background"
                        >
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                nodeTypes={assessmentNodeTypes}
                                colorMode={colorMode}
                                fitView
                                fitViewOptions={{ padding: 0.1 }}
                                defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
                                elevateEdgesOnSelect
                                connectionLineType={'smoothstep' as never}
                            >
                                {!isLargeGraph ? <MiniMap pannable zoomable /> : null}
                                <Controls />
                                <Background color="var(--border)" gap={20} size={1} />
                            </ReactFlow>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
