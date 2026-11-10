import { createHash } from 'crypto';
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiKnowledgeChunk } from '../../db/entites/ai-knowledge-chunk.entity';
import { getAllSaasDocs } from '../docs/saas-docs';
import { OpenAiProvider } from '../providers/openai.provider';
import { tierHasCapability } from '../usage/ai-tier.policy';
import { AiQuotasService } from '../usage/ai-quotas.service';
import {
    accumulateOrgKnowledgeRules,
    extractRequiredTagsFromContent,
    knowledgeDomainSchema,
    knowledgeRoleSchema,
    knowledgeStructuredRuleSchema,
    parseKnowledgeDocMeta,
    type KnowledgeDomain,
    type KnowledgeRole,
    type KnowledgeStructuredRule,
    type OrgKnowledgeRules,
} from './knowledge-rule.schema';

export type KnowledgeDocSummary = {
    id: string;
    title: string;
    source: string;
    contentPreview: string;
    content: string;
    domain: KnowledgeDomain;
    role: KnowledgeRole;
    rule?: KnowledgeStructuredRule;
    hasEmbedding: boolean;
    createdAt: Date;
    updatedAt: Date;
};

@Injectable()
export class KnowledgeBaseService implements OnModuleInit {
    private readonly logger = new Logger(KnowledgeBaseService.name);
    private pgvectorAvailable: boolean | null = null;

    constructor(
        @InjectRepository(AiKnowledgeChunk)
        private readonly chunkRepository: Repository<AiKnowledgeChunk>,
        private readonly openAiProvider: OpenAiProvider,
        private readonly quotasService: AiQuotasService,
    ) {}

    async onModuleInit(): Promise<void> {
        try {
            await this.seedGlobalDocs();
        } catch (error) {
            this.logger.warn(
                `knowledge.seed.skipped err=${error instanceof Error ? error.message : 'unknown'}`,
            );
        }
    }

    private hashContent(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    private toVectorLiteral(embedding: number[]): string {
        return `[${embedding.join(',')}]`;
    }

    private async hasPgvector(): Promise<boolean> {
        if (this.pgvectorAvailable !== null) {
            return this.pgvectorAvailable;
        }
        try {
            const rows = (await this.chunkRepository.query(
                `SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`,
            )) as unknown[];
            this.pgvectorAvailable = rows.length > 0;
        } catch {
            this.pgvectorAvailable = false;
        }
        if (!this.pgvectorAvailable) {
            this.logger.warn(
                'knowledge.pgvector.unavailable — semantic RAG search disabled until the vector extension is installed',
            );
        }
        return this.pgvectorAvailable;
    }

    private async assertEnterprise(organizationId: string): Promise<void> {
        const tier = await this.quotasService.getTier(organizationId);
        if (!tierHasCapability(tier, 'org_private_rag')) {
            throw new ForbiddenException(ErrorMessages.CLOUD_INTELLIGENCE.RAG_TIER_REQUIRED);
        }
    }

    async seedGlobalDocs(): Promise<void> {
        if (!this.openAiProvider.isConfigured() || !this.openAiProvider.supportsEmbeddings()) {
            return;
        }
        if (!(await this.hasPgvector())) {
            return;
        }

        const docs = getAllSaasDocs();
        for (const doc of docs) {
            const content = `${doc.title}\n\n${doc.body}`.slice(0, 6000);
            const contentHash = this.hashContent(`global:${doc.topic}:${content}`);
            const existing = await this.chunkRepository.findOne({
                where: { organizationId: IsNull(), contentHash },
            });
            if (existing) continue;

            const [embedding] = await this.openAiProvider.embed([content]);
            await this.chunkRepository.query(
                `
                INSERT INTO ai_knowledge_chunks
                    (id, organization_id, source, title, content, content_hash, embedding, metadata, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), NULL, $1, $2, $3, $4, $5::vector, $6::jsonb, now(), now())
                ON CONFLICT DO NOTHING
                `,
                [
                    'saas_docs',
                    doc.title,
                    content,
                    contentHash,
                    this.toVectorLiteral(embedding),
                    JSON.stringify({ topic: doc.topic }),
                ],
            );
        }
        this.logger.log(`knowledge.seed.global docs=${docs.length}`);
    }

    private toSummary(row: AiKnowledgeChunk): KnowledgeDocSummary {
        const meta = parseKnowledgeDocMeta(row.metadata);
        return {
            id: row.id,
            title: row.title,
            source: row.source,
            content: row.content,
            contentPreview: row.content.slice(0, 180),
            domain: meta.domain,
            role: meta.role,
            rule: meta.rule,
            hasEmbedding: Boolean((row as { embedding?: unknown }).embedding ?? row.metadata?.hasEmbedding),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    async listOrgDocuments(organizationId: string): Promise<KnowledgeDocSummary[]> {
        await this.assertEnterprise(organizationId);
        const rows = await this.chunkRepository.find({
            where: { organizationId },
            order: { updatedAt: 'DESC' },
            take: 100,
        });
        return rows.map((row) => this.toSummary(row));
    }

    /**
     * Loads structured org rules + guidance snippets from knowledge docs.
     * Used by Governance/FinOps/Automation without going through the chat LLM.
     */
    async getOrgRules(organizationId: string): Promise<OrgKnowledgeRules> {
        const rows = await this.chunkRepository.find({
            where: { organizationId },
            order: { updatedAt: 'DESC' },
            take: 200,
        });
        return accumulateOrgKnowledgeRules(rows);
    }

    async deleteOrgDocument(organizationId: string, id: string): Promise<{ ok: true }> {
        await this.assertEnterprise(organizationId);
        const existing = await this.chunkRepository.findOne({ where: { id, organizationId } });
        if (!existing) {
            throw new NotFoundException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_NOT_FOUND);
        }
        await this.chunkRepository.remove(existing);
        return { ok: true };
    }

    async upsertOrgDocument(
        organizationId: string,
        input: {
            id?: string;
            title: string;
            content: string;
            source?: string;
            domain?: KnowledgeDomain;
            role?: KnowledgeRole;
            rule?: KnowledgeStructuredRule;
        },
    ): Promise<{ ok: true; id: string; semanticSearchEnabled: boolean; warning?: string }> {
        await this.assertEnterprise(organizationId);

        if (!this.openAiProvider.isConfigured()) {
            throw new ServiceUnavailableException(ErrorMessages.CLOUD_INTELLIGENCE.PROVIDER_NOT_CONFIGURED);
        }

        const domain = knowledgeDomainSchema.parse(input.domain ?? 'general');
        const role = knowledgeRoleSchema.parse(input.role ?? 'guidance');
        if (role === 'tags' && domain !== 'governance') {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_DOMAIN_MISMATCH);
        }

        let rule: KnowledgeStructuredRule | undefined;
        // Structured rule payload is optional — users may express rules in free-text content.
        if (input.rule !== undefined) {
            const parsed = knowledgeStructuredRuleSchema.safeParse(input.rule);
            if (!parsed.success) {
                throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_INVALID);
            }
            rule = parsed.data;
            if (rule.type === 'required_tags' && domain !== 'governance') {
                throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_DOMAIN_MISMATCH);
            }
            if (rule.type === 'finops_threshold' && domain !== 'finops') {
                throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_DOMAIN_MISMATCH);
            }
            if (rule.type === 'automation_playbook' && domain !== 'automation') {
                throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_DOMAIN_MISMATCH);
            }
        }

        if (role === 'tags') {
            if (!rule || rule.type !== 'required_tags' || rule.keys.length === 0) {
                throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_INVALID);
            }
        }

        const title = input.title.trim().slice(0, 300);
        let body = input.content.trim().slice(0, 20000);
        if (!body && role === 'tags' && rule?.type === 'required_tags') {
            body = ['Tags obrigatórias:', ...rule.keys.map((key) => `- ${key}`)].join('\n');
        }
        const content = `${title}\n\n${body}`.slice(0, 20000);

        // Auto-materialize required tags from free-text only for explicit tag/rule docs.
        if (!rule && (role === 'tags' || (domain === 'governance' && role === 'rule'))) {
            const keys = extractRequiredTagsFromContent(content);
            if (keys.length > 0) {
                rule = {
                    type: 'required_tags',
                    keys,
                    providers: ['aws', 'azure', 'gcp'],
                };
            }
        }

        if (role === 'tags' && (!rule || rule.type !== 'required_tags' || rule.keys.length === 0)) {
            throw new BadRequestException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_RULE_INVALID);
        }
        const contentHash = this.hashContent(`org:${organizationId}:${content}`);
        const source = input.source ?? 'org_docs';
        const baseMetadata: Record<string, unknown> = {
            domain,
            role,
            ...(rule ? { rule } : {}),
        };
        const canEmbed =
            this.openAiProvider.supportsEmbeddings() && (await this.hasPgvector());

        let embedding: number[] | null = null;
        if (canEmbed) {
            try {
                const [vector] = await this.openAiProvider.embed([content.slice(0, 8000)]);
                embedding = vector;
            } catch (error) {
                this.logger.warn(
                    `knowledge.embed.failed org=${organizationId} ${error instanceof Error ? error.message : 'unknown'}`,
                );
            }
        }

        let existingById: AiKnowledgeChunk | null = null;
        if (input.id) {
            existingById = await this.chunkRepository.findOne({
                where: { id: input.id, organizationId },
            });
            if (!existingById) {
                throw new NotFoundException(ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_NOT_FOUND);
            }
        }

        if (embedding && canEmbed && !existingById) {
            await this.chunkRepository.query(
                `
                INSERT INTO ai_knowledge_chunks
                    (id, organization_id, source, title, content, content_hash, embedding, metadata, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), $1, $2, $3, $4, $5, $6::vector, $7::jsonb, now(), now())
                ON CONFLICT (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), content_hash)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    source = EXCLUDED.source,
                    embedding = EXCLUDED.embedding,
                    metadata = EXCLUDED.metadata,
                    updated_at = now()
                `,
                [
                    organizationId,
                    source,
                    title,
                    content,
                    contentHash,
                    this.toVectorLiteral(embedding),
                    JSON.stringify({ ...baseMetadata, hasEmbedding: true }),
                ],
            );
        } else if (embedding && canEmbed && existingById) {
            await this.chunkRepository.query(
                `
                UPDATE ai_knowledge_chunks
                SET title = $1,
                    content = $2,
                    source = $3,
                    content_hash = $4,
                    embedding = $5::vector,
                    metadata = $6::jsonb,
                    updated_at = now()
                WHERE id = $7::uuid AND organization_id = $8::uuid
                `,
                [
                    title,
                    content,
                    source,
                    contentHash,
                    this.toVectorLiteral(embedding),
                    JSON.stringify({ ...baseMetadata, hasEmbedding: true }),
                    existingById.id,
                    organizationId,
                ],
            );
        } else {
            // Persist without vector so the library still works when pgvector/embeddings are offline.
            const existing =
                existingById ??
                (await this.chunkRepository.findOne({
                    where: { organizationId, contentHash },
                }));
            if (existing) {
                existing.title = title;
                existing.content = content;
                existing.source = source;
                existing.contentHash = contentHash;
                existing.metadata = { ...baseMetadata, hasEmbedding: false };
                await this.chunkRepository.save(existing);
            } else {
                await this.chunkRepository.save(
                    this.chunkRepository.create({
                        organizationId,
                        source,
                        title,
                        content,
                        contentHash,
                        metadata: { ...baseMetadata, hasEmbedding: false },
                    }),
                );
            }
        }

        const saved = existingById
            ? await this.chunkRepository.findOne({ where: { id: existingById.id, organizationId } })
            : await this.chunkRepository.findOne({
                  where: { organizationId, contentHash },
                  order: { updatedAt: 'DESC' },
              });

        return {
            ok: true,
            id: saved?.id ?? existingById?.id ?? contentHash,
            semanticSearchEnabled: Boolean(embedding),
            warning: embedding
                ? undefined
                : ErrorMessages.CLOUD_INTELLIGENCE.KNOWLEDGE_EMBEDDING_UNAVAILABLE,
        };
    }

    async search(
        organizationId: string,
        query: string,
        limit = 5,
        domain?: KnowledgeDomain,
    ): Promise<
        Array<{
            id: string;
            title: string;
            content: string;
            source: string;
            score: number;
            domain?: KnowledgeDomain;
            role?: KnowledgeRole;
        }>
    > {
        if (!this.openAiProvider.isConfigured() || !this.openAiProvider.supportsEmbeddings()) {
            return this.searchFallback(organizationId, query, limit, domain);
        }
        if (!(await this.hasPgvector())) {
            return this.searchFallback(organizationId, query, limit, domain);
        }

        const tier = await this.quotasService.getTier(organizationId);
        const allowOrgPrivate = tierHasCapability(tier, 'org_private_rag');

        const [embedding] = await this.openAiProvider.embed([query.slice(0, 2000)]);
        const vector = this.toVectorLiteral(embedding);

        const rows = (await this.chunkRepository.query(
            `
            SELECT id, title, content, source, metadata,
                   1 - (embedding <=> $1::vector) AS score
            FROM ai_knowledge_chunks
            WHERE embedding IS NOT NULL
              AND (
                organization_id IS NULL
                OR ($2::boolean = true AND organization_id = $3::uuid)
              )
              AND ($5::text IS NULL OR COALESCE(metadata->>'domain', 'general') = $5::text)
            ORDER BY embedding <=> $1::vector
            LIMIT $4
            `,
            [vector, allowOrgPrivate, organizationId, limit, domain ?? null],
        )) as Array<{
            id: string;
            title: string;
            content: string;
            source: string;
            score: number;
            metadata?: Record<string, unknown>;
        }>;

        return rows.map((row) => {
            const meta = parseKnowledgeDocMeta(row.metadata);
            return {
                id: row.id,
                title: row.title,
                content: row.content,
                source: row.source,
                score: Number(row.score),
                domain: meta.domain,
                role: meta.role,
            };
        });
    }

    /** Keyword fallback when embeddings/pgvector are unavailable. */
    private async searchFallback(
        organizationId: string,
        query: string,
        limit: number,
        domain?: KnowledgeDomain,
    ): Promise<
        Array<{
            id: string;
            title: string;
            content: string;
            source: string;
            score: number;
            domain?: KnowledgeDomain;
            role?: KnowledgeRole;
        }>
    > {
        const tier = await this.quotasService.getTier(organizationId);
        const allowOrgPrivate = tierHasCapability(tier, 'org_private_rag');
        if (!allowOrgPrivate) return [];

        const needle = query.trim().toLowerCase();
        const rows = await this.chunkRepository.find({
            where: { organizationId },
            order: { updatedAt: 'DESC' },
            take: 100,
        });

        return rows
            .map((row) => this.toSummary(row))
            .filter((row) => (domain ? row.domain === domain : true))
            .map((row) => {
                const hay = `${row.title}\n${row.content}`.toLowerCase();
                const score = needle && hay.includes(needle) ? 0.8 : needle ? 0.2 : 0.5;
                return {
                    id: row.id,
                    title: row.title,
                    content: row.content,
                    source: row.source,
                    score,
                    domain: row.domain,
                    role: row.role,
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}
