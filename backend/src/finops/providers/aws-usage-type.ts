/** Prefixo regional do Cost Explorer (`USE1-`, `SAE1-`) separado do tipo de uso. */
export function describeAwsUsageType(usageType: string): { resourceId: string; region: string } {
    const trimmed = usageType.trim();
    const match = trimmed.match(/^([A-Z]{2,4}\d?)-(.+)$/);
    if (!match?.[2]) return { resourceId: trimmed, region: '' };
    return { resourceId: match[2], region: match[1] };
}
