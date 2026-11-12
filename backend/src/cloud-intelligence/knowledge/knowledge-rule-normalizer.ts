import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { OpenAiProvider } from '../providers/openai.provider';
import {
    ALL_CLOUD_PROVIDERS,
    extractNamingPatternsFromContent,
    extractRequiredTagsFromContent,
    knowledgeStructuredRuleSchema,
    namingPatternToRegExp,
    type KnowledgeStructuredRule,
} from './knowledge-rule.schema';

const llmRuleExtractionSchema = z.object({
    requiredTags: z.array(z.string().min(1).max(64)).max(20).optional(),
    namingPatterns: z
        .array(
            z.object({
                pattern: z.string().min(1).max(200),
                example: z.string().min(1).max(200).optional(),
            }),
        )
        .max(10)
        .optional(),
});

export type NormalizedGovernanceRules = {
    tags?: Extract<KnowledgeStructuredRule, { type: 'required_tags' }>;
    naming?: Extract<KnowledgeStructuredRule, { type: 'naming_pattern' }>;
};

/**
 * Heuristic + optional LLM extraction of structured governance rules from free text.
 * Never throws — callers treat this as best-effort enrichment.
 */
export async function normalizeGovernanceRulesFromText(input: {
    title: string;
    content: string;
    openAiProvider: OpenAiProvider;
    logger?: Logger;
}): Promise<NormalizedGovernanceRules> {
    const logger = input.logger ?? new Logger('KnowledgeRuleNormalizer');
    const text = `${input.title}\n${input.content}`;
    const result: NormalizedGovernanceRules = {};

    const tagKeys = extractRequiredTagsFromContent(text);
    if (tagKeys.length > 0) {
        result.tags = {
            type: 'required_tags',
            keys: tagKeys,
            providers: [...ALL_CLOUD_PROVIDERS],
        };
    }

    const naming = extractNamingPatternsFromContent(text);
    if (naming[0]) {
        result.naming = {
            type: 'naming_pattern',
            pattern: naming[0].pattern,
            ...(naming[0].example ? { example: naming[0].example } : {}),
            providers: [...ALL_CLOUD_PROVIDERS],
        };
    }

    const needsLlm =
        (!result.tags || !result.naming) &&
        /(tag|nomenclatura|naming|name\s*pattern|padrão\s+de\s+nome|padrao\s+de\s+nome)/i.test(text);

    if (!needsLlm || !input.openAiProvider.isConfigured()) {
        return result;
    }

    try {
        const completion = await input.openAiProvider.complete({
            maxTokens: 400,
            messages: [
                {
                    role: 'system',
                    content:
                        'Extract cloud governance tagging and naming rules from the user text. ' +
                        'Return ONLY compact JSON with optional keys requiredTags (string[]) and ' +
                        'namingPatterns ({pattern, example?}[]). Use glob (*) or regex patterns. ' +
                        'If nothing clear, return {}.',
                },
                {
                    role: 'user',
                    content: text.slice(0, 4000),
                },
            ],
        });

        const raw = completion.content?.trim() ?? '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return result;

        const parsedJson = JSON.parse(jsonMatch[0]) as unknown;
        const parsed = llmRuleExtractionSchema.safeParse(parsedJson);
        if (!parsed.success) return result;

        if (!result.tags && parsed.data.requiredTags?.length) {
            const keys = [...new Set(parsed.data.requiredTags.map((key) => key.trim()).filter(Boolean))].slice(
                0,
                20,
            );
            if (keys.length > 0) {
                const candidate = {
                    type: 'required_tags' as const,
                    keys,
                    providers: [...ALL_CLOUD_PROVIDERS],
                };
                if (knowledgeStructuredRuleSchema.safeParse(candidate).success) {
                    result.tags = candidate;
                }
            }
        }

        if (!result.naming && parsed.data.namingPatterns?.length) {
            const first = parsed.data.namingPatterns.find(
                (item) => item.pattern.trim() && namingPatternToRegExp(item.pattern.trim()),
            );
            if (first) {
                const candidate = {
                    type: 'naming_pattern' as const,
                    pattern: first.pattern.trim(),
                    ...(first.example?.trim() ? { example: first.example.trim() } : {}),
                    providers: [...ALL_CLOUD_PROVIDERS],
                };
                if (knowledgeStructuredRuleSchema.safeParse(candidate).success) {
                    result.naming = candidate;
                }
            }
        }
    } catch (error) {
        logger.warn(
            `knowledge.rule.normalize.llm_failed ${error instanceof Error ? error.message : 'unknown'}`,
        );
    }

    return result;
}
