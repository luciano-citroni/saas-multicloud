import { z } from 'zod';

export const knowledgeDomainSchema = z.enum(['governance', 'finops', 'automation', 'general']);
export type KnowledgeDomain = z.infer<typeof knowledgeDomainSchema>;

export const knowledgeRoleSchema = z.enum(['guidance', 'rule', 'tags']);
export type KnowledgeRole = z.infer<typeof knowledgeRoleSchema>;

export const requiredTagsRuleSchema = z.object({
    type: z.literal('required_tags'),
    keys: z.array(z.string().min(1).max(64)).min(1).max(20),
    providers: z.array(z.enum(['aws', 'azure', 'gcp'])).min(1).optional(),
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
    finopsThresholdRuleSchema,
    automationPlaybookRuleSchema,
]);

export type KnowledgeStructuredRule = z.infer<typeof knowledgeStructuredRuleSchema>;

export type OrgKnowledgeRules = {
    requiredTags: string[];
    requiredTagProviders: Array<'aws' | 'azure' | 'gcp'>;
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
} {
    const domainParsed = knowledgeDomainSchema.safeParse(metadata?.domain);
    const roleParsed = knowledgeRoleSchema.safeParse(metadata?.role);
    const ruleParsed = knowledgeStructuredRuleSchema.safeParse(metadata?.rule);
    return {
        domain: domainParsed.success ? domainParsed.data : 'general',
        role: roleParsed.success ? roleParsed.data : 'guidance',
        rule: ruleParsed.success ? ruleParsed.data : undefined,
    };
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

export function accumulateOrgKnowledgeRules(
    rows: Array<{ title: string; content: string; metadata?: Record<string, unknown> | null }>,
): OrgKnowledgeRules {
    const rules = emptyOrgKnowledgeRules();
    const tagKeys = new Set<string>();
    const tagProviders = new Set<'aws' | 'azure' | 'gcp'>();

    for (const row of rows) {
        const meta = parseKnowledgeDocMeta(row.metadata);
        const snippet = `${row.title}\n${row.content}`.slice(0, 1200);
        rules.guidanceByDomain[meta.domain].push(snippet);

        // Structured payload wins; otherwise infer tag keys from free-text that looks like a tag policy.
        // Do not require domain=governance + role=rule — users often save the policy as plain text.
        if (meta.rule?.type === 'required_tags') {
            for (const key of meta.rule.keys) {
                tagKeys.add(key.trim());
            }
            for (const provider of meta.rule.providers ?? ['aws', 'azure', 'gcp']) {
                tagProviders.add(provider);
            }
        } else if (!meta.rule || meta.rule.type !== 'required_tags') {
            const inferred = extractRequiredTagsFromContent(`${row.title}\n${row.content}`);
            for (const key of inferred) {
                tagKeys.add(key);
            }
            if (inferred.length > 0) {
                tagProviders.add('aws');
                tagProviders.add('azure');
                tagProviders.add('gcp');
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
    rules.requiredTagProviders = [...tagProviders];
    rules.automation.preferredActions = [...new Set(rules.automation.preferredActions)].slice(0, 20);
    for (const domain of Object.keys(rules.guidanceByDomain) as KnowledgeDomain[]) {
        rules.guidanceByDomain[domain] = rules.guidanceByDomain[domain].slice(0, 8);
    }
    return rules;
}
