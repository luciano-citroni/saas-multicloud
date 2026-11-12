import {
    namingPatternToRegExp,
    type OrgNamingPattern,
} from '../../cloud-intelligence/knowledge/knowledge-rule.schema';
import type { PolicyContext, PolicyEvaluationResult } from './policy.interface';

export function resolveApplicableRequiredTags(
    context: PolicyContext,
    provider: 'aws' | 'gcp' | 'azure',
    resourceType: string,
): string[] | null {
    const tags = context.orgRules?.requiredTags ?? [];
    if (tags.length === 0) return null;

    const providers = context.orgRules?.requiredTagProviders ?? [];
    if (providers.length > 0 && !providers.includes(provider)) {
        return null;
    }

    const resourceTypes = context.orgRules?.requiredTagResourceTypes ?? [];
    if (resourceTypes.length > 0 && !resourceTypes.includes(resourceType)) {
        return null;
    }

    return tags;
}

export function resolveApplicableNamingPatterns(
    context: PolicyContext,
    provider: 'aws' | 'gcp' | 'azure',
    resourceType: string,
): OrgNamingPattern[] {
    const patterns = context.orgRules?.namingPatterns ?? [];
    return patterns.filter((pattern) => {
        if (pattern.providers?.length && !pattern.providers.includes(provider)) {
            return false;
        }
        if (pattern.resourceTypes?.length && !pattern.resourceTypes.includes(resourceType)) {
            return false;
        }
        return true;
    });
}

export function findMissingTagKeys(
    tags: Record<string, string> | null | undefined,
    requiredTags: string[],
): string[] {
    const presentLower = new Map(
        Object.keys(tags ?? {}).map((key) => [key.toLowerCase(), key] as const),
    );
    return requiredTags.filter((tag) => !presentLower.has(tag.toLowerCase()));
}

export function evaluateRequiredTagsFinding(input: {
    resourceId: string;
    resourceType: string;
    resourceLabel: string;
    tags: Record<string, string> | null | undefined;
    requiredTags: string[];
    extraMetadata?: Record<string, unknown>;
}): PolicyEvaluationResult {
    const missingTags = findMissingTagKeys(input.tags, input.requiredTags);
    const presentTags = Object.keys(input.tags ?? {});

    if (missingTags.length > 0) {
        return {
            status: 'non_compliant',
            resourceId: input.resourceId,
            resourceType: input.resourceType,
            description: `${input.resourceLabel} is missing required tags: ${missingTags.join(', ')}.`,
            recommendation: `Add the following required tags: ${missingTags.join(', ')}.`,
            metadata: {
                missingTags,
                presentTags,
                requiredTags: input.requiredTags,
                source: 'org_knowledge_rule',
                knowledgeRuleType: 'required_tags',
                ...(input.extraMetadata ?? {}),
            },
        };
    }

    return {
        status: 'compliant',
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        description: `${input.resourceLabel} has all required tags (${input.requiredTags.join(', ')}).`,
        recommendation: '',
    };
}

export function evaluateNamingFinding(input: {
    resourceId: string;
    resourceType: string;
    resourceLabel: string;
    nameValue: string | null | undefined;
    patterns: OrgNamingPattern[];
    extraMetadata?: Record<string, unknown>;
}): PolicyEvaluationResult | null {
    if (input.patterns.length === 0) return null;

    const nameValue = (input.nameValue ?? '').trim();
    const failed: Array<{ pattern: string; example?: string }> = [];

    for (const pattern of input.patterns) {
        const regex = namingPatternToRegExp(pattern.pattern);
        if (!regex) continue;
        if (!nameValue || !regex.test(nameValue)) {
            failed.push({
                pattern: pattern.pattern,
                ...(pattern.example ? { example: pattern.example } : {}),
            });
        }
    }

    if (failed.length === 0) {
        return {
            status: 'compliant',
            resourceId: input.resourceId,
            resourceType: input.resourceType,
            description: `${input.resourceLabel} matches organization naming patterns.`,
            recommendation: '',
        };
    }

    const expected = failed.map((item) => item.pattern).join(', ');
    const example = failed.find((item) => item.example)?.example;
    return {
        status: 'non_compliant',
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        description: `${input.resourceLabel} name "${nameValue || '(empty)'}" does not match required naming pattern(s): ${expected}.`,
        recommendation: example
            ? `Rename the resource to match the organization pattern (example: ${example}).`
            : `Rename the resource to match the organization naming pattern(s): ${expected}.`,
        metadata: {
            actualName: nameValue || null,
            expectedPatterns: failed.map((item) => item.pattern),
            expectedPattern: failed[0]?.pattern,
            example: example ?? null,
            source: 'org_knowledge_rule',
            knowledgeRuleType: 'naming_pattern',
            ...(input.extraMetadata ?? {}),
        },
    };
}

/** Prefer Name tag; fall back to a canonical resource name field. */
export function resolveAwsDisplayName(
    tags: Record<string, string> | null | undefined,
    fallbackName?: string | null,
): string {
    const nameTag =
        tags?.Name ??
        tags?.name ??
        Object.entries(tags ?? {}).find(([key]) => key.toLowerCase() === 'name')?.[1];
    return (nameTag ?? fallbackName ?? '').trim();
}
