import {
    accumulateOrgKnowledgeRules,
    extractRequiredTagsFromContent,
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
});
