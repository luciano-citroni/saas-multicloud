/** Split a tag pair on the first `:`. Always returns trimmed key/value parts. */
export function parseTagPair(raw: string | null | undefined): { key: string; value: string } {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
        return { key: '', value: '' };
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex < 0) {
        return { key: trimmed, value: '' };
    }

    return {
        key: trimmed.slice(0, colonIndex).trim(),
        value: trimmed.slice(colonIndex + 1).trim(),
    };
}

/** Human-readable label with spaces around `:`. */
export function formatTagLabel(key: string, value?: string | null): string {
    const normalizedKey = key.trim();
    if (!normalizedKey) return '';
    const normalizedValue = String(value ?? '').trim();
    return normalizedValue ? `${normalizedKey} : ${normalizedValue}` : normalizedKey;
}

/** Compose the API/URL filter value as `key` or `key:value` (no spaces). */
export function composeTagFilter(key: string, value?: string | null): string {
    const normalizedKey = key.trim();
    if (!normalizedKey) return '';
    const normalizedValue = String(value ?? '').trim();
    return normalizedValue ? `${normalizedKey}:${normalizedValue}` : normalizedKey;
}

export function uniqueTagKeys(tagOptions: string[]): string[] {
    const keys = new Set<string>();
    for (const option of tagOptions) {
        const { key } = parseTagPair(option);
        if (key) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function tagValuesForKey(tagOptions: string[], key: string): string[] {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) return [];

    const values = new Set<string>();
    for (const option of tagOptions) {
        const parsed = parseTagPair(option);
        if (parsed.key.toLowerCase() !== normalizedKey) continue;
        if (parsed.value) values.add(parsed.value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
}
