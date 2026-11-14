'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function SelectionMark({ checked, multiple }: { checked: boolean; multiple?: boolean }) {
    return (
        <span
            aria-hidden
            className={cn(
                'flex size-4 shrink-0 items-center justify-center border border-input',
                multiple ? 'rounded-[4px]' : 'rounded-sm',
                checked && 'border-primary bg-primary text-primary-foreground',
            )}
        >
            {checked ? <Check className="size-3" /> : null}
        </span>
    );
}

export type SearchableSelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

type SearchableSelectBaseProps = {
    options: SearchableSelectOption[];
    /** Optional label rendered above the trigger. */
    label?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    clearLabel?: string;
    /** For multiple mode: row that clears selection (e.g. "All accounts"). */
    allLabel?: string;
    /** Template for multi selection trigger, use {count}. Default: "{count} selected". */
    selectedCountLabel?: string;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
    contentClassName?: string;
    id?: string;
    /** Show search input even with few options. Default true. */
    searchable?: boolean;
};

type SearchableSelectMultipleProps = SearchableSelectBaseProps & {
    mode?: 'multiple';
    value: string[];
    onValueChange: (value: string[]) => void;
};

type SearchableSelectSingleProps = SearchableSelectBaseProps & {
    mode: 'single';
    value: string;
    onValueChange: (value: string) => void;
};

export type SearchableSelectProps = SearchableSelectMultipleProps | SearchableSelectSingleProps;

export function SearchableSelect(props: SearchableSelectProps) {
    const {
        options,
        label,
        placeholder,
        searchPlaceholder = 'Search',
        emptyText = 'No results',
        clearLabel = 'Clear',
        allLabel,
        selectedCountLabel = '{count} selected',
        disabled = false,
        className,
        triggerClassName,
        contentClassName,
        id,
        searchable = true,
    } = props;
    const mode = props.mode ?? 'multiple';
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedValues = mode === 'single' ? (props.value ? [props.value] : []) : props.value;

    const triggerLabel = useMemo(() => {
        if (mode === 'single') {
            return options.find((o) => o.value === props.value)?.label ?? placeholder ?? props.value;
        }
        if (selectedValues.length === 0) return allLabel ?? placeholder ?? 'All';
        if (selectedValues.length === 1) {
            return options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0];
        }
        return selectedCountLabel.replace('{count}', String(selectedValues.length));
    }, [allLabel, mode, options, placeholder, props, selectedCountLabel, selectedValues]);

    const normalizedQuery = query.trim().toLowerCase();
    const filteredOptions = useMemo(() => {
        if (!normalizedQuery) return options;
        return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
    }, [normalizedQuery, options]);

    const selectSingle = (next: string) => {
        if (props.mode !== 'single') return;
        props.onValueChange(next);
        setOpen(false);
        setQuery('');
    };

    const toggleMultiple = (next: string, checked: boolean) => {
        if ((props.mode ?? 'multiple') !== 'multiple') return;
        const multi = props as SearchableSelectMultipleProps;
        if (checked) multi.onValueChange([...multi.value, next]);
        else multi.onValueChange(multi.value.filter((item) => item !== next));
    };

    return (
        <div className={cn('min-w-0 space-y-1.5', className)}>
            {label ? (
                <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                    {label}
                </label>
            ) : null}
            <Popover
                open={open}
                onOpenChange={(next) => {
                    if (disabled) return;
                    setOpen(next);
                    if (!next) setQuery('');
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        aria-label={label ?? placeholder}
                        className={cn(
                            'h-8 w-full justify-between gap-1.5 px-2.5 font-normal',
                            !selectedValues.length && mode === 'multiple' && 'text-muted-foreground',
                            triggerClassName,
                        )}
                    >
                        <span className="min-w-0 flex-1 truncate text-left text-sm">{triggerLabel}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                            {mode === 'multiple' && selectedValues.length > 0 ? (
                                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] leading-none">
                                    {selectedValues.length}
                                </Badge>
                            ) : null}
                            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className={cn('w-[var(--radix-popover-trigger-width)] min-w-56 gap-1 p-2', contentClassName)}>
                    {searchable ? (
                        <div className="relative mb-1">
                            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={searchPlaceholder}
                                className="h-8 pr-7 pl-7"
                                autoFocus
                            />
                            {query ? (
                                <button
                                    type="button"
                                    className="absolute top-1/2 right-1.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    onClick={() => setQuery('')}
                                    aria-label={clearLabel}
                                >
                                    <X className="size-3.5" />
                                </button>
                            ) : null}
                        </div>
                    ) : null}

                    {mode === 'multiple' && allLabel ? (
                        <>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => (props as SearchableSelectMultipleProps).onValueChange([])}
                            >
                                <SelectionMark checked={selectedValues.length === 0} multiple />
                                <span className="truncate">{allLabel}</span>
                            </button>
                            <div className="my-1 h-px bg-border" />
                        </>
                    ) : null}

                    <div className="max-h-56 space-y-0.5 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                {options.length === 0 ? '—' : emptyText}
                            </p>
                        ) : (
                            filteredOptions.map((option) => {
                                const checked = selectedValues.includes(option.value);
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        disabled={option.disabled}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                                            option.disabled && 'pointer-events-none opacity-50',
                                        )}
                                        onClick={() =>
                                            mode === 'single'
                                                ? selectSingle(option.value)
                                                : toggleMultiple(option.value, !checked)
                                        }
                                    >
                                        <SelectionMark checked={checked} multiple={mode === 'multiple'} />
                                        <span className="truncate">{option.label}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {mode === 'multiple' && selectedValues.length > 0 ? (
                        <>
                            <div className="my-1 h-px bg-border" />
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full"
                                onClick={() => (props as SearchableSelectMultipleProps).onValueChange([])}
                            >
                                {clearLabel}
                            </Button>
                        </>
                    ) : null}
                </PopoverContent>
            </Popover>
        </div>
    );
}
