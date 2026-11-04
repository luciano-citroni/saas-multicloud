/** Short display id for cloud resource ARNs / paths. */
export function shortResourceId(resourceId: string): string {
    const trimmed = resourceId.trim();
    if (!trimmed) return '—';
    if (trimmed.includes('/')) {
        const parts = trimmed.split('/').filter(Boolean);
        return parts[parts.length - 1] ?? trimmed;
    }
    if (trimmed.startsWith('arn:')) {
        const parts = trimmed.split('/');
        return parts[parts.length - 1] ?? trimmed;
    }
    return trimmed.length > 40 ? `${trimmed.slice(0, 18)}…${trimmed.slice(-12)}` : trimmed;
}

export function formatResourceChange(field: string, previousValue: string, newValue: string): string {
    const labels: Record<string, string> = {
        instanceType: 'Tipo da instância',
        state: 'Estado',
        sku: 'SKU',
        machineType: 'Tipo de máquina',
        vmSize: 'Tamanho da VM',
    };
    const label = labels[field] ?? field;
    return `${label}: ${previousValue || '—'} → ${newValue || '—'}`;
}
