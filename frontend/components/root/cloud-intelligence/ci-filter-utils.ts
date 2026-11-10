'use client';

import { useEffect, useRef, useState } from 'react';

export type CiFilters = {
    provider?: string;
    account?: string;
    category?: string;
    severity?: string;
    status?: string;
};

export function parseCiFilters(searchParams: URLSearchParams): CiFilters {
    return {
        provider: searchParams.get('provider') ?? undefined,
        account: searchParams.get('account') ?? undefined,
        category: searchParams.get('category') ?? undefined,
        severity: searchParams.get('severity') ?? undefined,
        status: searchParams.get('status') ?? undefined,
    };
}

export function buildCiSearchParams(
    current: URLSearchParams,
    patch: Partial<CiFilters>,
): URLSearchParams {
    const next = new URLSearchParams(current.toString());
    for (const key of ['provider', 'account', 'category', 'severity', 'status'] as const) {
        const value = patch[key];
        if (value === undefined) continue;
        if (!value) next.delete(key);
        else next.set(key, value);
    }
    return next;
}

function filtersEqual(a: CiFilters, b: CiFilters): boolean {
    return (
        (a.provider ?? '') === (b.provider ?? '') &&
        (a.account ?? '') === (b.account ?? '') &&
        (a.category ?? '') === (b.category ?? '') &&
        (a.severity ?? '') === (b.severity ?? '') &&
        (a.status ?? '') === (b.status ?? '')
    );
}

/** Apply all CI filter keys (missing/empty deletes the param). */
export function applyCiFiltersToSearchParams(
    current: URLSearchParams,
    filters: CiFilters,
): URLSearchParams {
    const next = new URLSearchParams(current.toString());
    for (const key of ['provider', 'account', 'category', 'severity', 'status'] as const) {
        const value = filters[key];
        if (!value) next.delete(key);
        else next.set(key, value);
    }
    return next;
}

/** Local draft + 300ms debounce before committing filter URL updates. */
export function useDebouncedCiFilterDraft(
    committed: CiFilters,
    onCommit: (nextFilters: CiFilters) => void,
    delayMs = 300,
) {
    const [draft, setDraft] = useState<CiFilters>(committed);
    const onCommitRef = useRef(onCommit);
    onCommitRef.current = onCommit;

    useEffect(() => {
        setDraft((prev) => (filtersEqual(prev, committed) ? prev : committed));
    }, [committed]);

    useEffect(() => {
        if (filtersEqual(draft, committed)) return;
        const timer = window.setTimeout(() => {
            onCommitRef.current(draft);
        }, delayMs);
        return () => window.clearTimeout(timer);
    }, [draft, committed, delayMs]);

    const setDraftField = <K extends keyof CiFilters>(key: K, value: CiFilters[K]) => {
        setDraft((prev) => ({ ...prev, [key]: value }));
    };

    return { draft, setDraftField };
}
