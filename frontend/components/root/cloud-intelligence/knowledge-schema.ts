import { z } from 'zod';

export type KnowledgeSchemaMessages = {
    titleRequired: string;
    contentRequired: string;
    tagsRequired: string;
    namingRequired: string;
    accountsRequired: string;
};

const knowledgeDomainSchema = z.enum(['general', 'governance', 'finops', 'automation']);
const knowledgeRoleSchema = z.enum(['guidance', 'rule', 'tags', 'naming']);
const knowledgeScopeSchema = z.enum(['organization', 'cloud_accounts']);

export function createKnowledgeSchema(msgs: KnowledgeSchemaMessages) {
    return z
        .object({
            title: z.string().trim().min(1, msgs.titleRequired),
            content: z.string(),
            domain: knowledgeDomainSchema,
            role: knowledgeRoleSchema,
            tagRows: z.array(z.string()),
            namingPattern: z.string(),
            namingExample: z.string(),
            scope: knowledgeScopeSchema,
            selectedAccountIds: z.array(z.string()),
        })
        .superRefine((data, ctx) => {
            const isTagsRole = data.domain === 'governance' && data.role === 'tags';
            const isNamingRole = data.domain === 'governance' && data.role === 'naming';

            if (isTagsRole) {
                const tags = data.tagRows.map((tag) => tag.trim()).filter(Boolean);
                if (tags.length === 0) {
                    ctx.addIssue({ code: 'custom', message: msgs.tagsRequired, path: ['tagRows'] });
                }
            } else if (isNamingRole) {
                if (!data.namingPattern.trim()) {
                    ctx.addIssue({ code: 'custom', message: msgs.namingRequired, path: ['namingPattern'] });
                }
            } else if (!data.content.trim()) {
                ctx.addIssue({ code: 'custom', message: msgs.contentRequired, path: ['content'] });
            }

            if ((isTagsRole || isNamingRole) && data.scope === 'cloud_accounts' && data.selectedAccountIds.length === 0) {
                ctx.addIssue({ code: 'custom', message: msgs.accountsRequired, path: ['selectedAccountIds'] });
            }
        });
}

export type KnowledgeFormValues = z.infer<ReturnType<typeof createKnowledgeSchema>>;

export const knowledgeFormDefaults: KnowledgeFormValues = {
    title: '',
    content: '',
    domain: 'general',
    role: 'guidance',
    tagRows: [''],
    namingPattern: '',
    namingExample: '',
    scope: 'organization',
    selectedAccountIds: [],
};
