'use client';

import { Download, FileSpreadsheet, FolderTree, Layers3, LayoutGrid, Play, Radar, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GroupingDimension, ResourceVisibilityFilterId } from '@/components/root/assessment/types';
import { RESOURCE_VISIBILITY_FILTER_OPTIONS } from '@/components/root/assessment/assessment-graph-utils';
import { useTranslations } from '@/lib/i18n';

const GROUPING_MODE_OPTIONS: Array<{ value: GroupingDimension; icon: typeof Layers3 }> = [
    { value: 'resourceType', icon: Layers3 },
    { value: 'vpc', icon: FolderTree },
    { value: 'region', icon: Radar },
];

type GroupingLabels = Record<GroupingDimension, string> & { none: string };

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

export function getGroupingModeLabel(modes: GroupingDimension[], labels: GroupingLabels): string {
    if (modes.length === 0) {
        return labels.none;
    }

    return modes.map((mode) => labels[mode] ?? mode).join(' + ');
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
    const ta = useTranslations('assessment');
    const groupingLabels: Record<GroupingDimension, string> = {
        resourceType: ta.groupByType,
        vpc: ta.groupByNetwork,
        region: ta.groupByRegion,
    };

    return (
        <div className="rounded-xl border">
            <div className="flex min-w-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium" title={title}>{title}</p>
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{ta.nodesBadge.replace('{count}', String(nodeCount))}</Badge>
                    <Badge variant="outline">{ta.edgesBadge.replace('{count}', String(edgeCount))}</Badge>
                    <Badge variant="outline">{ta.visualGroupsBadge.replace('{count}', String(groupCount))}</Badge>
                </div>
            </div>

            <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:items-center">
                <Button type="button" className="w-full sm:w-auto" onClick={onRun} isLoading={running} disabled={!canRun}>
                    <Play className="size-4" />
                    {ta.runAssessment}
                </Button>
                <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={onReorganize} disabled={nodeCount === 0 || running}>
                    <LayoutGrid className="size-4" />
                    {ta.reorganizeGraph}
                </Button>
                <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={onDownload} isLoading={downloading} disabled={nodeCount === 0}>
                    <Download className="size-4" />
                    {ta.downloadDiagram}
                </Button>
                {showExcelButton && (
                    <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={onExcelDownload} isLoading={generatingExcel} disabled={!canRun || running}>
                        <FileSpreadsheet className="size-4" />
                        {generatingExcel ? ta.queueingReport : ta.generateExcel}
                    </Button>
                )}
                <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border/80 bg-muted/30 p-1 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
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
                        className="h-9 min-w-0 justify-center rounded-md px-2 text-xs sm:h-8 sm:w-auto sm:justify-start sm:px-3 sm:text-sm"
                    >
                        <ScanSearch className="size-3.5 shrink-0 sm:size-4" />
                        <span className="truncate">{ta.noGroups}</span>
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
                                className="h-9 min-w-0 justify-center rounded-md px-2 text-xs sm:h-8 sm:w-auto sm:justify-start sm:px-3 sm:text-sm"
                            >
                                <Icon className="size-3.5 shrink-0 sm:size-4" />
                                <span className="truncate">{groupingLabels[option.value]}</span>
                            </Button>
                        );
                    })}
                </div>
                <div className="flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/20 p-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <span className="px-2 text-xs font-medium text-muted-foreground">{ta.hideLabel}</span>
                    <div className="grid grid-cols-2 gap-1 sm:contents">
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
                                    className="h-9 min-w-0 justify-center rounded-md px-2 text-xs sm:h-8 sm:w-auto sm:justify-start sm:px-3 sm:text-sm"
                                >
                                    <span className="truncate">{option.label}</span>
                                </Button>
                            );
                        })}
                    </div>
                </div>
                {!canRun ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={onConnectCloudAccount}
                        disabled={!canCreateCloudAccount}
                        title={!canCreateCloudAccount ? ta.connectCloudPermission : ta.connectCloudTooltip}
                    >
                        {ta.connectCloudAccount}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
