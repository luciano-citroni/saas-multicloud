import { z } from 'zod';

export const knowledgeDomainSchema = z.enum(['governance', 'finops', 'automation', 'general']);
export type KnowledgeDomain = z.infer<typeof knowledgeDomainSchema>;

export const knowledgeRoleSchema = z.enum(['guidance', 'rule', 'tags', 'naming']);
export type KnowledgeRole = z.infer<typeof knowledgeRoleSchema>;

export const cloudProviderSchema = z.enum(['aws', 'azure', 'gcp']);
export type CloudProvider = z.infer<typeof cloudProviderSchema>;

export const ALL_CLOUD_PROVIDERS: CloudProvider[] = ['aws', 'azure', 'gcp'];

export const knowledgeScopeSchema = z.enum(['organization', 'cloud_accounts']);
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;

export const requiredTagsRuleSchema = z.object({
    type: z.literal('required_tags'),
    keys: z.array(z.string().min(1).max(64)).min(1).max(20),
    /** Defaults to all providers when omitted. */
    providers: z.array(cloudProviderSchema).min(1).optional(),
    resourceTypes: z.array(z.string().min(1).max(64)).min(1).optional(),
});

export const namingPatternRuleSchema = z.object({
    type: z.literal('naming_pattern'),
    pattern: z.string().min(1).max(200),
    example: z.string().min(1).max(200).optional(),
    /** Defaults to all providers when omitted. */
    providers: z.array(cloudProviderSchema).min(1).optional(),
    resourceTypes: z.array(z.string().min(1).max(64)).min(1).optional(),
});

export const finopsThresholdRuleSchema = z.object({
    type: z.literal('finops_threshold'),
    anomalyMultiplier: z.number().min(1.05).max(5).optional(),
    minMonthlySavingUsd: z.number().min(0).max(1_000_000).optional(),
});

export const automationPlaybookRuleSchema = z.object({
    type: z.literal('automation_playbook'),
    preferredActions: z.array(z.string().min(1).max(100)).max(20).optional(),
    requireHumanApproval: z.boolean().optional(),
});

export const knowledgeStructuredRuleSchema = z.discriminatedUnion('type', [
    requiredTagsRuleSchema,
    namingPatternRuleSchema,
    finopsThresholdRuleSchema,
    automationPlaybookRuleSchema,
]);

export type KnowledgeStructuredRule = z.infer<typeof knowledgeStructuredRuleSchema>;
export type NamingPatternRule = z.infer<typeof namingPatternRuleSchema>;

export type OrgNamingPattern = {
    pattern: string;
    example?: string;
    providers: CloudProvider[];
    resourceTypes?: string[];
    scope: KnowledgeScope;
    cloudAccountIds: string[];
};

export type OrgKnowledgeRules = {
    requiredTags: string[];
    requiredTagProviders: CloudProvider[];
    requiredTagResourceTypes: string[];
    /** Account IDs that constrain required tags; empty = org-wide. */
    requiredTagCloudAccountIds: string[];
    namingPatterns: OrgNamingPattern[];
    finops: {
        anomalyMultiplier?: number;
        minMonthlySavingUsd?: number;
    };
    automation: {
        preferredActions: string[];
        requireHumanApproval: boolean;
        playbookSnippets: string[];
    };
    guidanceByDomain: Record<KnowledgeDomain, string[]>;
};

export function emptyOrgKnowledgeRules(): OrgKnowledgeRules {
    return {
        requiredTags: [],
        requiredTagProviders: [],
        requiredTagResourceTypes: [],
        requiredTagCloudAccountIds: [],
        namingPatterns: [],
        finops: {},
        automation: {
            preferredActions: [],
            requireHumanApproval: true,
            playbookSnippets: [],
        },
        guidanceByDomain: {
            governance: [],
            finops: [],
            automation: [],
            general: [],
        },
    };
}

export function parseKnowledgeDocMeta(metadata: Record<string, unknown> | null | undefined): {
    domain: KnowledgeDomain;
    role: KnowledgeRole;
    rule?: KnowledgeStructuredRule;
    scope: KnowledgeScope;
    cloudAccountIds: string[];
} {
    const domainParsed = knowledgeDomainSchema.safeParse(metadata?.domain);
    const roleParsed = knowledgeRoleSchema.safeParse(metadata?.role);
    const ruleParsed = knowledgeStructuredRuleSchema.safeParse(metadata?.rule);
    const scopeParsed = knowledgeScopeSchema.safeParse(metadata?.scope);
    const accountIdsRaw = Array.isArray(metadata?.cloudAccountIds)
        ? metadata.cloudAccountIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
    const scope: KnowledgeScope = scopeParsed.success
        ? scopeParsed.data
        : accountIdsRaw.length > 0
          ? 'cloud_accounts'
          : 'organization';
    return {
        domain: domainParsed.success ? domainParsed.data : 'general',
        role: roleParsed.success ? roleParsed.data : 'guidance',
        rule: ruleParsed.success ? ruleParsed.data : undefined,
        scope,
        cloudAccountIds: scope === 'cloud_accounts' ? [...new Set(accountIdsRaw)].slice(0, 50) : [],
    };
}

/** Whether a knowledge doc applies to the given cloud account during a scan. */
export function knowledgeDocAppliesToAccount(
    meta: { scope: KnowledgeScope; cloudAccountIds: string[] },
    cloudAccountId?: string | null,
): boolean {
    if (meta.scope === 'organization' || meta.cloudAccountIds.length === 0) {
        return true;
    }
    if (!cloudAccountId) {
        // No account context (e.g. chat/RAG) → include all docs.
        return true;
    }
    return meta.cloudAccountIds.includes(cloudAccountId);
}

/**
 * Convert a user-facing glob-like pattern into a RegExp.
 * - `*` → `.*`
 * - `?` → `.`
 * - If the pattern already looks like a regex (`^...$` or contains `\`), use as-is.
 */
export function namingPatternToRegExp(pattern: string): RegExp | null {
    const trimmed = pattern.trim();
    if (!trimmed) return null;

    try {
        if (trimmed.startsWith('^') || trimmed.endsWith('$') || trimmed.includes('\\')) {
            return new RegExp(trimmed, 'i');
        }
        const escaped = trimmed
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(`^${escaped}$`, 'i');
    } catch {
        return null;
    }
}

/**
 * Infer required tag keys from free-text / markdown governance rules.
 * Example:
 *   "todos os recursos precisam das tags:\n- Ambiente\n- Criador\n- Cliente"
 */
export function extractRequiredTagsFromContent(content: string): string[] {
    const text = content.replace(/\r\n/g, '\n');
    if (!/tag/i.test(text)) {
        return [];
    }

    const tags: string[] = [];
    const pushTag = (raw: string) => {
        const cleaned = raw
            .replace(/\*\*|__/g, '')
            .replace(/^[`"'“”]+|[`"'“”]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!cleaned || cleaned.length > 64) return;
        // Prefer short label-like values (1–3 tokens), skip long sentences.
        if (cleaned.split(' ').length > 3) return;
        if (/^(as|the|seguintes|following|tags?)$/i.test(cleaned)) return;
        tags.push(cleaned);
    };

    // Inline forms on the same line: "tags: Ambiente, Criador, Cliente"
    for (const match of text.matchAll(/\btags?\b[ \t]*[:=][ \t]*([^\n.]+)/gi)) {
        for (const part of match[1].split(/[,;/|]/)) {
            pushTag(part);
        }
    }

    const lines = text.split('\n');
    let inTagSection = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (inTagSection) inTagSection = false;
            continue;
        }

        if (/\btags?\b/i.test(trimmed) && !/^([-*+]|\d+\.)\s+/.test(trimmed)) {
            inTagSection = true;
        }

        const bullet = trimmed.match(/^([-*+]|•)\s+(.+)$/) ?? trimmed.match(/^\d+\.\s+(.+)$/);
        if (!bullet) continue;

        const item = (bullet[2] ?? bullet[1] ?? '').trim();
        if (inTagSection || /\btags?\b/i.test(text.slice(0, Math.min(text.length, 400)))) {
            // "Ambiente: prod" → Ambiente
            const keyOnly = item.split(/[:=]/)[0]?.trim() ?? item;
            pushTag(keyOnly);
        }
    }

    return [...new Set(tags)].slice(0, 20);
}

/**
 * Infer naming patterns from free-text / markdown governance rules.
 * Examples:
 *   "padrão de nomenclatura: prod-*-web"
 *   "naming pattern: ^prod-[a-z]+$"
 *   "- prod-*-app"
 */
export function extractNamingPatternsFromContent(content: string): Array<{ pattern: string; example?: string }> {
    const text = content.replace(/\r\n/g, '\n');
    if (!/(nomenclatura|naming|name\s*pattern|padrão\s+de\s+nome|padrao\s+de\s+nome)/i.test(text)) {
        return [];
    }

    const patterns: Array<{ pattern: string; example?: string }> = [];
    const pushPattern = (raw: string, example?: string) => {
        const cleaned = raw
            .replace(/\*\*|__/g, '')
            .replace(/^[`"'“”]+|[`"'“”]+$/g, '')
            .replace(/\s+/g, '')
            .trim();
        if (!cleaned || cleaned.length > 200) return;
        if (/^(padrão|padrao|pattern|naming|nomenclatura|nome)$/i.test(cleaned)) return;
        if (namingPatternToRegExp(cleaned) === null) return;
        if (patterns.some((item) => item.pattern === cleaned)) return;
        patterns.push({ pattern: cleaned, ...(example ? { example } : {}) });
    };

    for (const match of text.matchAll(
        /(?:nomenclatura|naming(?:\s+pattern)?|name\s*pattern|padrão\s+de\s+nome|padrao\s+de\s+nome)\b[ \t]*[:=][ \t]*([^\n]+)/gi,
    )) {
        const inline = match[1].trim();
        const exampleMatch = inline.match(/\((?:ex(?:emplo)?|example)[:\s]+([^)]+)\)/i);
        const patternPart = inline.split(/[;,|(]/)[0]?.trim() ?? inline;
        pushPattern(patternPart, exampleMatch?.[1]?.trim());
    }

    const lines = text.split('\n');
    let inNamingSection = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (inNamingSection) inNamingSection = false;
            continue;
        }

        if (
            /(nomenclatura|naming|name\s*pattern|padrão\s+de\s+nome|padrao\s+de\s+nome)/i.test(trimmed) &&
            !/^([-*+]|\d+\.)\s+/.test(trimmed)
        ) {
            inNamingSection = true;
        }

        const bullet = trimmed.match(/^([-*+]|•)\s+(.+)$/) ?? trimmed.match(/^\d+\.\s+(.+)$/);
        if (!bullet) continue;
        const item = (bullet[2] ?? bullet[1] ?? '').trim();
        if (!inNamingSection) continue;
        const exampleMatch = item.match(/\((?:ex(?:emplo)?|example)[:\s]+([^)]+)\)/i);
        const patternPart = item.split(/\s+[—–-]\s+/)[0]?.trim() ?? item;
        pushPattern(patternPart.split(/\s+/)[0] ?? patternPart, exampleMatch?.[1]?.trim());
    }

    return patterns.slice(0, 10);
}

export function accumulateOrgKnowledgeRules(
    rows: Array<{ title: string; content: string; metadata?: Record<string, unknown> | null }>,
    options?: { cloudAccountId?: string | null },
): OrgKnowledgeRules {
    const rules = emptyOrgKnowledgeRules();
    const tagKeys = new Set<string>();
    const tagProviders = new Set<CloudProvider>();
    const tagResourceTypes = new Set<string>();
    const tagAccountIds = new Set<string>();
    let hasOrgWideTagRule = false;
    const namingPatterns: OrgNamingPattern[] = [];
    const namingKeys = new Set<string>();

    const pushNaming = (item: OrgNamingPattern) => {
        const key = `${item.pattern}::${item.providers.join(',')}::${(item.resourceTypes ?? []).join(',')}::${item.scope}::${item.cloudAccountIds.join(',')}`;
        if (namingKeys.has(key)) return;
        namingKeys.add(key);
        namingPatterns.push(item);
    };

    for (const row of rows) {
        const meta = parseKnowledgeDocMeta(row.metadata);
        if (!knowledgeDocAppliesToAccount(meta, options?.cloudAccountId)) {
            continue;
        }

        const snippet = `${row.title}\n${row.content}`.slice(0, 1200);
        rules.guidanceByDomain[meta.domain].push(snippet);

        // Structured payload wins; otherwise infer from free-text.
        if (meta.rule?.type === 'required_tags') {
            for (const key of meta.rule.keys) {
                tagKeys.add(key.trim());
            }
            for (const provider of meta.rule.providers ?? ALL_CLOUD_PROVIDERS) {
                tagProviders.add(provider);
            }
            for (const resourceType of meta.rule.resourceTypes ?? []) {
                tagResourceTypes.add(resourceType);
            }
            if (meta.scope === 'cloud_accounts' && meta.cloudAccountIds.length > 0) {
                for (const id of meta.cloudAccountIds) tagAccountIds.add(id);
            } else {
                hasOrgWideTagRule = true;
            }
        } else if (meta.rule?.type === 'naming_pattern') {
            pushNaming({
                pattern: meta.rule.pattern.trim(),
                example: meta.rule.example?.trim(),
                providers: meta.rule.providers ?? [...ALL_CLOUD_PROVIDERS],
                resourceTypes: meta.rule.resourceTypes,
                scope: meta.scope,
                cloudAccountIds: meta.cloudAccountIds,
            });
        } else if (!meta.rule) {
            const inferredTags = extractRequiredTagsFromContent(`${row.title}\n${row.content}`);
            for (const key of inferredTags) {
                tagKeys.add(key);
            }
            if (inferredTags.length > 0) {
                for (const provider of ALL_CLOUD_PROVIDERS) tagProviders.add(provider);
                if (meta.scope === 'cloud_accounts' && meta.cloudAccountIds.length > 0) {
                    for (const id of meta.cloudAccountIds) tagAccountIds.add(id);
                } else {
                    hasOrgWideTagRule = true;
                }
            }

            const inferredNaming = extractNamingPatternsFromContent(`${row.title}\n${row.content}`);
            for (const item of inferredNaming) {
                pushNaming({
                    pattern: item.pattern,
                    example: item.example,
                    providers: [...ALL_CLOUD_PROVIDERS],
                    scope: meta.scope,
                    cloudAccountIds: meta.cloudAccountIds,
                });
            }
        }

        if (meta.role !== 'rule') continue;

        if (meta.rule?.type === 'finops_threshold') {
            if (typeof meta.rule.anomalyMultiplier === 'number') {
                rules.finops.anomalyMultiplier = meta.rule.anomalyMultiplier;
            }
            if (typeof meta.rule.minMonthlySavingUsd === 'number') {
                rules.finops.minMonthlySavingUsd = meta.rule.minMonthlySavingUsd;
            }
        }

        if (meta.rule?.type === 'automation_playbook') {
            if (meta.rule.preferredActions?.length) {
                rules.automation.preferredActions.push(...meta.rule.preferredActions);
            }
            if (typeof meta.rule.requireHumanApproval === 'boolean') {
                rules.automation.requireHumanApproval = meta.rule.requireHumanApproval;
            }
            rules.automation.playbookSnippets.push(snippet);
        }
    }

    rules.requiredTags = [...tagKeys].filter(Boolean).slice(0, 20);
    rules.requiredTagProviders =
        tagProviders.size > 0 ? [...tagProviders] : [...ALL_CLOUD_PROVIDERS];
    rules.requiredTagResourceTypes = [...tagResourceTypes].slice(0, 40);
    // If any org-wide tag rule exists, account filter is empty (applies everywhere).
    rules.requiredTagCloudAccountIds = hasOrgWideTagRule ? [] : [...tagAccountIds].slice(0, 50);
    rules.namingPatterns = namingPatterns.slice(0, 20);
    rules.automation.preferredActions = [...new Set(rules.automation.preferredActions)].slice(0, 20);
    for (const domain of Object.keys(rules.guidanceByDomain) as KnowledgeDomain[]) {
        rules.guidanceByDomain[domain] = rules.guidanceByDomain[domain].slice(0, 8);
    }
    return rules;
}
