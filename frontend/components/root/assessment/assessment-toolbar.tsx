import { Download, FileSpreadsheet, FolderTree, Layers3, LayoutGrid, Play, Radar, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GroupingDimension, ResourceVisibilityFilterId } from '@/components/root/assessment/types';
import { RESOURCE_VISIBILITY_FILTER_OPTIONS } from '@/components/root/assessment/assessment-graph-utils';

export const GROUPING_MODE_OPTIONS: Array<{ value: GroupingDimension; label: string; icon: typeof Layers3 }> = [
    { value: 'resourceType', label: 'Por tipo', icon: Layers3 },
    { value: 'vpc', label: 'Por rede', icon: FolderTree },
    { value: 'region', label: 'Por região', icon: Radar },
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
    generatingExcel: boolean;
    showExcelButton: boolean;
    groupingModes: GroupingDimension[];
    hiddenResourceFilterIds: Set<ResourceVisibilityFilterId>;
    onRun: () => void;
    onReorganize: () => void;
    onDownload: () => void;
    onExcelDownload: () => void;
    onToggleGroupingMode: (mode: GroupingDimension) => void;
    onToggleResourceFilter: (filterId: ResourceVisibilityFilterId) => void;
    onConnectCloudAccount: () => void;
};

export function getGroupingModeLabel(modes: GroupingDimension[]): string {
    if (modes.length === 0) {
        return 'Sem grupos';
    }

    return modes.map((mode) => GROUPING_MODE_OPTIONS.find((item) => item.value === mode)?.label ?? mode).join(' + ');
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
    generatingExcel,
    showExcelButton,
    groupingModes,
    hiddenResourceFilterIds,
    onRun,
    onReorganize,
    onDownload,
    onExcelDownload,
    onToggleGroupingMode,
    onToggleResourceFilter,
    onConnectCloudAccount,
}: AssessmentToolbarProps) {
    return (
        <div className="rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="space-y-0.5">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline">Nós: {nodeCount}</Badge>
                    <Badge variant="outline">Arestas: {edgeCount}</Badge>
                    <Badge variant="outline">Grupos visuais: {groupCount}</Badge>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-4">
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
                {showExcelButton && (
                    <Button type="button" variant="outline" onClick={onExcelDownload} isLoading={generatingExcel} disabled={!canRun || running}>
                        <FileSpreadsheet className="size-4" />
                        {generatingExcel ? 'Gerando relatório…' : 'Baixar relatório Excel'}
                    </Button>
                )}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-1">
                    <Button
                        type="button"
                        size="sm"
                        variant={groupingModes.length === 0 ? 'default' : 'ghost'}
                        onClick={() => {
                            for (const selected of groupingModes) {
                                onToggleGroupingMode(selected);
                            }
                        }}
                        disabled={nodeCount === 0 || running}
                        className="rounded-md"
                    >
                        <ScanSearch className="size-4" />
                        Sem grupos
                    </Button>
                    {GROUPING_MODE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const selected = groupingModes.includes(option.value);

                        return (
                            <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={selected ? 'default' : 'ghost'}
                                onClick={() => onToggleGroupingMode(option.value)}
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
                        title={!canCreateCloudAccount ? 'Apenas OWNER/ADMIN pode conectar contas cloud.' : 'Conectar conta cloud'}
                    >
                        Conectar Conta Cloud
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
