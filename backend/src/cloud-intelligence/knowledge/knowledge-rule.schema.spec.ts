import {
    accumulateOrgKnowledgeRules,
    extractNamingPatternsFromContent,
    extractRequiredTagsFromContent,
    namingPatternToRegExp,
} from './knowledge-rule.schema';

describe('extractRequiredTagsFromContent', () => {
    it('reads markdown bullet tags from Portuguese free-text rules', () => {
        const keys = extractRequiredTagsFromContent(`
Nas tags eu preciso que todos os recursos tenha as seguintes tags:
- Ambiente
- Criador
- Cliente
`);
        expect(keys).toEqual(['Ambiente', 'Criador', 'Cliente']);
    });
});

describe('accumulateOrgKnowledgeRules', () => {
    it('extracts required tags from governance rules', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Tag policy',
                content: 'All resources need tags',
                metadata: {
                    domain: 'governance',
                    role: 'rule',
                    rule: {
                        type: 'required_tags',
                        keys: ['ambiente', 'produto', 'criador'],
                        providers: ['aws', 'gcp'],
                    },
                },
            },
            {
                title: 'Guidance only',
                content: 'Explain tagging to the team',
                metadata: { domain: 'governance', role: 'guidance' },
            },
        ]);

        expect(rules.requiredTags).toEqual(['ambiente', 'produto', 'criador']);
        expect(rules.requiredTagProviders).toEqual(['aws', 'gcp']);
        expect(rules.guidanceByDomain.governance).toHaveLength(2);
    });

    it('infers required tags from free-text governance rules without structured payload', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Politica de tags',
                content:
                    'Nas tags eu preciso que todos os recursos tenha as seguintes tags:\n- Ambiente\n- Criador\n- Cliente',
                metadata: { domain: 'governance', role: 'rule' },
            },
        ]);

        expect(rules.requiredTags).toEqual(['Ambiente', 'Criador', 'Cliente']);
    });

    it('infers required tags even when saved as general/guidance', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Politica de tags',
                content:
                    'Nas tags eu preciso que todos os recursos tenha as seguintes tags:\n- Ambiente\n- Criador\n- Cliente',
                metadata: { domain: 'general', role: 'guidance' },
            },
        ]);

        expect(rules.requiredTags).toEqual(['Ambiente', 'Criador', 'Cliente']);
    });

    it('extracts required tags from role=tags documents', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Tags da org',
                content: 'Tags obrigatórias:\n- Ambiente\n- Criador\n- Cliente',
                metadata: {
                    domain: 'governance',
                    role: 'tags',
                    rule: {
                        type: 'required_tags',
                        keys: ['Ambiente', 'Criador', 'Cliente'],
                        providers: ['aws', 'azure', 'gcp'],
                    },
                },
            },
        ]);

        expect(rules.requiredTags).toEqual(['Ambiente', 'Criador', 'Cliente']);
    });

    it('extracts finops anomaly multiplier', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Anomaly policy',
                content: 'Stricter anomalies',
                metadata: {
                    domain: 'finops',
                    role: 'rule',
                    rule: { type: 'finops_threshold', anomalyMultiplier: 1.5 },
                },
            },
        ]);

        expect(rules.finops.anomalyMultiplier).toBe(1.5);
    });

    it('extracts naming patterns from structured role=naming documents', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Naming',
                content: 'Padrão de nomenclatura: prod-*-web',
                metadata: {
                    domain: 'governance',
                    role: 'naming',
                    rule: {
                        type: 'naming_pattern',
                        pattern: 'prod-*-web',
                        example: 'prod-api-web',
                        providers: ['aws', 'gcp'],
                    },
                },
            },
        ]);

        expect(rules.namingPatterns).toEqual([
            {
                pattern: 'prod-*-web',
                example: 'prod-api-web',
                providers: ['aws', 'gcp'],
                resourceTypes: undefined,
                scope: 'organization',
                cloudAccountIds: [],
            },
        ]);
    });

    it('filters account-scoped rules for a specific cloud account', () => {
        const rows = [
            {
                title: 'Org tags',
                content: 'Tags',
                metadata: {
                    domain: 'governance',
                    role: 'tags',
                    scope: 'organization',
                    rule: {
                        type: 'required_tags',
                        keys: ['OrgTag'],
                        providers: ['aws', 'azure', 'gcp'],
                    },
                },
            },
            {
                title: 'Account tags',
                content: 'Tags',
                metadata: {
                    domain: 'governance',
                    role: 'tags',
                    scope: 'cloud_accounts',
                    cloudAccountIds: ['acc-a'],
                    rule: {
                        type: 'required_tags',
                        keys: ['AccountTag'],
                        providers: ['aws', 'azure', 'gcp'],
                    },
                },
            },
        ];

        expect(accumulateOrgKnowledgeRules(rows, { cloudAccountId: 'acc-a' }).requiredTags).toEqual(
            expect.arrayContaining(['OrgTag', 'AccountTag']),
        );
        expect(accumulateOrgKnowledgeRules(rows, { cloudAccountId: 'acc-b' }).requiredTags).toEqual([
            'OrgTag',
        ]);
    });

    it('infers naming patterns from free-text', () => {
        const rules = accumulateOrgKnowledgeRules([
            {
                title: 'Nomenclatura',
                content: 'Padrão de nomenclatura: prod-*-app\n- staging-*-web',
                metadata: { domain: 'governance', role: 'rule' },
            },
        ]);

        expect(rules.namingPatterns.map((item) => item.pattern)).toEqual(
            expect.arrayContaining(['prod-*-app', 'staging-*-web']),
        );
    });
});

describe('extractNamingPatternsFromContent', () => {
    it('reads inline naming patterns', () => {
        expect(extractNamingPatternsFromContent('nomenclatura: prod-*-web (exemplo: prod-api-web)')).toEqual([
            { pattern: 'prod-*-web', example: 'prod-api-web' },
        ]);
    });
});

describe('namingPatternToRegExp', () => {
    it('converts glob patterns', () => {
        const regex = namingPatternToRegExp('prod-*-web');
        expect(regex?.test('prod-api-web')).toBe(true);
        expect(regex?.test('dev-api-web')).toBe(false);
    });
});
