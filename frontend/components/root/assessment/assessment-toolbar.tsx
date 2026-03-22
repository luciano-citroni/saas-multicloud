import { Download, FolderTree, Layers3, LayoutGrid, Play, Radar, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GroupingMode, ResourceVisibilityFilterId } from '@/components/root/assessment/types';
import { RESOURCE_VISIBILITY_FILTER_OPTIONS } from '@/components/root/assessment/assessment-graph-utils';

export const GROUPING_MODE_OPTIONS: Array<{ value: GroupingMode; label: string; icon: typeof Layers3 }> = [
    { value: 'resourceType', label: 'Por tipo', icon: Layers3 },
    { value: 'vpc', label: 'Por rede', icon: FolderTree },
    { value: 'region', label: 'Por região', icon: Radar },
    { value: 'none', label: 'Sem grupos', icon: ScanSearch },
];

type AssessmentToolbarProps = {
    title: string;
    subtitle: string;
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
    canRun: boolean;
    canCreateCloudAccount: boolean;
    running: boolean;
    downloading: boolean;
    groupingMode: GroupingMode;
    hiddenResourceFilterIds: Set<ResourceVisibilityFilterId>;
    onRun: () => void;
    onReorganize: () => void;
    onDownload: () => void;
    onGroupingModeChange: (mode: GroupingMode) => void;
    onToggleResourceFilter: (filterId: ResourceVisibilityFilterId) => void;
    onConnectCloudAccount: () => void;
};

export function getGroupingModeLabel(mode: GroupingMode): string {
    return GROUPING_MODE_OPTIONS.find((item) => item.value === mode)?.label ?? 'Sem grupos';
}

export function AssessmentToolbar({
    title,
    subtitle,
    nodeCount,
    edgeCount,
    groupCount,
    canRun,
    canCreateCloudAccount,
    running,
    downloading,
    groupingMode,
    hiddenResourceFilterIds,
    onRun,
    onReorganize,
    onDownload,
    onGroupingModeChange,
    onToggleResourceFilter,
    onConnectCloudAccount,
}: AssessmentToolbarProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>{title}</CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">Nós: {nodeCount}</Badge>
                        <Badge variant="outline">Arestas: {edgeCount}</Badge>
                        <Badge variant="outline">Grupos visuais: {groupCount}</Badge>
                    </div>
                </div>
                <CardDescription>{subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={onRun} isLoading={running} disabled={!canRun}>
                    <Play className="size-4" />
                    Rodar assessment
                </Button>
                <Button type="button" variant="outline" onClick={onReorganize} disabled={nodeCount === 0 || running}>
                    <LayoutGrid className="size-4" />
                    Reorganizar grafo
                </Button>
                <Button type="button" variant="outline" onClick={onDownload} isLoading={downloading} disabled={nodeCount === 0}>
                    <Download className="size-4" />
                    Baixar diagrama
                </Button>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-1">
                    {GROUPING_MODE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const selected = groupingMode === option.value;

                        return (
                            <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={selected ? 'default' : 'ghost'}
                                onClick={() => onGroupingModeChange(option.value)}
                                disabled={nodeCount === 0 || running}
                                className="rounded-md"
                            >
                                <Icon className="size-4" />
                                {option.label}
                            </Button>
                        );
                    })}
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/20 p-1.5">
                    <span className="px-2 text-xs font-medium text-muted-foreground">Ocultar:</span>
                    {RESOURCE_VISIBILITY_FILTER_OPTIONS.map((option) => {
                        const selected = hiddenResourceFilterIds.has(option.id);

                        return (
                            <Button
                                key={option.id}
                                type="button"
                                size="sm"
                                variant={selected ? 'secondary' : 'ghost'}
                                onClick={() => onToggleResourceFilter(option.id)}
                                disabled={nodeCount === 0 || running}
                                className="rounded-md"
                            >
                                {option.label}
                            </Button>
                        );
                    })}
                </div>
                {!canRun ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onConnectCloudAccount}
                        disabled={!canCreateCloudAccount}
                        title={!canCreateCloudAccount ? 'Apenas OWNER/ADMIN pode conectar cloud accounts.' : 'Conectar cloud account'}
                    >
                        Conectar cloud account
                    </Button>
                ) : null}
            </CardContent>
        </Card>
    );
}
