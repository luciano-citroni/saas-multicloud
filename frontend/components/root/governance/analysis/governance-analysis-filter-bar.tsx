'use client';

import { useEffect, useRef, useState } from 'react';
import { Filter, RotateCcw, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { translateGovernanceResourceType, translateGovernanceSeverity } from '@/lib/governance-translations';
import { cn } from '@/lib/utils';

export const RESOURCE_TYPE_FILTER_ALL = 'all' as const;
export const SEVERITY_FILTER_ALL = 'all' as const;

export type SeverityFilter = typeof SEVERITY_FILTER_ALL | 'low' | 'medium' | 'high' | 'critical';
export type ResourceTypeFilter = typeof RESOURCE_TYPE_FILTER_ALL | string;

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
    { value: 'all', label: 'Todas as criticidades' },
    { value: 'critical', label: translateGovernanceSeverity('critical') },
    { value: 'high', label: translateGovernanceSeverity('high') },
    { value: 'medium', label: translateGovernanceSeverity('medium') },
    { value: 'low', label: translateGovernanceSeverity('low') },
];

const SEARCH_DEBOUNCE_MS = 350;

type GovernanceAnalysisFilterBarProps = {
    nameFilter: string;
    severityFilter: SeverityFilter;
    resourceTypeFilter: ResourceTypeFilter;
    resourceTypeOptions: string[];
    totalFiltered: number;
    totalFindings: number;
    pageSize: number;
    pageSizeOptions: readonly number[];
    onNameChange: (value: string) => void;
    onSeverityChange: (value: SeverityFilter) => void;
    onResourceTypeChange: (value: ResourceTypeFilter) => void;
    onPageSizeChange: (value: number) => void;
    onClear: () => void;
    className?: string;
};

function FilterFields({
    draftName,
    severityFilter,
    resourceTypeFilter,
    resourceTypeOptions,
    onDraftNameChange,
    onSeverityChange,
    onResourceTypeChange,
}: {
    draftName: string;
    severityFilter: SeverityFilter;
    resourceTypeFilter: ResourceTypeFilter;
    resourceTypeOptions: string[];
    onDraftNameChange: (value: string) => void;
    onSeverityChange: (value: SeverityFilter) => void;
    onResourceTypeChange: (value: ResourceTypeFilter) => void;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <label htmlFor="governance-findings-search" className="text-xs font-medium text-muted-foreground">
                    Busca
                </label>
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="governance-findings-search"
                        value={draftName}
                        onChange={(event) => onDraftNameChange(event.target.value)}
                        placeholder="Política, tipo ou recurso"
                        className="w-full pr-9 pl-9"
                    />
                    {draftName.trim().length > 0 && (
                        <button
                            type="button"
                            aria-label="Limpar busca"
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => onDraftNameChange('')}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-1.5">
                <label htmlFor="governance-findings-severity" className="text-xs font-medium text-muted-foreground">
                    Criticidade
                </label>
                <Select value={severityFilter} onValueChange={(value) => onSeverityChange(value as SeverityFilter)}>
                    <SelectTrigger id="governance-findings-severity" className="w-full">
                        <SelectValue placeholder="Todas as criticidades" />
                    </SelectTrigger>
                    <SelectContent>
                        {SEVERITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <label htmlFor="governance-findings-resource-type" className="text-xs font-medium text-muted-foreground">
                    Tipo de recurso
                </label>
                <Select
                    value={resourceTypeFilter}
                    onValueChange={(value) => onResourceTypeChange(value as ResourceTypeFilter)}
                >
                    <SelectTrigger id="governance-findings-resource-type" className="w-full">
                        <SelectValue placeholder="Todos os tipos" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={RESOURCE_TYPE_FILTER_ALL}>Todos os tipos</SelectItem>
                        {resourceTypeOptions.map((resourceType) => (
                            <SelectItem key={resourceType} value={resourceType}>
                                {translateGovernanceResourceType(resourceType)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

export function GovernanceAnalysisFilterBar({
    nameFilter,
    severityFilter,
    resourceTypeFilter,
    resourceTypeOptions,
    totalFiltered,
    totalFindings,
    pageSize,
    pageSizeOptions,
    onNameChange,
    onSeverityChange,
    onResourceTypeChange,
    onPageSizeChange,
    onClear,
    className,
}: GovernanceAnalysisFilterBarProps) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const [draftName, setDraftName] = useState(nameFilter);
    const onNameChangeRef = useRef(onNameChange);

    useEffect(() => {
        onNameChangeRef.current = onNameChange;
    }, [onNameChange]);

    useEffect(() => {
        setDraftName(nameFilter);
    }, [nameFilter]);

    useEffect(() => {
        if (draftName === nameFilter) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            onNameChangeRef.current(draftName);
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [draftName, nameFilter]);

    const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];

    if (nameFilter.trim().length > 0) {
        activeChips.push({
            key: 'name',
            label: `Busca: ${nameFilter.trim()}`,
            onClear: () => {
                setDraftName('');
                onNameChange('');
            },
        });
    }

    if (severityFilter !== SEVERITY_FILTER_ALL) {
        activeChips.push({
            key: 'severity',
            label: `Criticidade: ${translateGovernanceSeverity(severityFilter)}`,
            onClear: () => onSeverityChange(SEVERITY_FILTER_ALL),
        });
    }

    if (resourceTypeFilter !== RESOURCE_TYPE_FILTER_ALL) {
        activeChips.push({
            key: 'resourceType',
            label: `Tipo: ${translateGovernanceResourceType(resourceTypeFilter)}`,
            onClear: () => onResourceTypeChange(RESOURCE_TYPE_FILTER_ALL),
        });
    }

    const hasActiveFilters = activeChips.length > 0;

    const handleClear = () => {
        setDraftName('');
        onClear();
    };

    return (
        <section className={cn('space-y-3 border-b px-4 py-3', className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Filter className="size-4 text-muted-foreground" />
                    Filtros
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {totalFiltered} de {totalFindings} achados
                    </span>

                    <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
                        <SelectTrigger className="h-8 w-[7.5rem]" aria-label="Itens por página">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {pageSizeOptions.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size}/pág.
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {hasActiveFilters && (
                        <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
                            <RotateCcw className="size-3.5" />
                            Limpar
                        </Button>
                    )}

                    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                        <SheetTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="lg:hidden">
                                <Filter className="size-3.5" />
                                Ajustar
                                {hasActiveFilters ? ` (${activeChips.length})` : ''}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
                            <SheetHeader>
                                <SheetTitle>Filtros da análise</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4 space-y-4 pb-6">
                                <FilterFields
                                    draftName={draftName}
                                    severityFilter={severityFilter}
                                    resourceTypeFilter={resourceTypeFilter}
                                    resourceTypeOptions={resourceTypeOptions}
                                    onDraftNameChange={setDraftName}
                                    onSeverityChange={onSeverityChange}
                                    onResourceTypeChange={onResourceTypeChange}
                                />
                                <Button type="button" className="w-full" onClick={() => setSheetOpen(false)}>
                                    Aplicar
                                </Button>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            <div className="hidden lg:block">
                <FilterFields
                    draftName={draftName}
                    severityFilter={severityFilter}
                    resourceTypeFilter={resourceTypeFilter}
                    resourceTypeOptions={resourceTypeOptions}
                    onDraftNameChange={setDraftName}
                    onSeverityChange={onSeverityChange}
                    onResourceTypeChange={onResourceTypeChange}
                />
            </div>

            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                    {activeChips.map((chip) => (
                        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
                            {chip.label}
                            <button
                                type="button"
                                className="rounded-full p-0.5 hover:bg-muted"
                                onClick={chip.onClear}
                                aria-label={`Remover filtro ${chip.label}`}
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </section>
    );
}
