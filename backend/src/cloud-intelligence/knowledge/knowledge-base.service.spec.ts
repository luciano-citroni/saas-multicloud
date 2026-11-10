import { ForbiddenException } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseService', () => {
    const chunkRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => ({ id: 'doc-1', ...value })),
        remove: jest.fn(),
        query: jest.fn(),
    };
    const openAiProvider = {
        isConfigured: jest.fn(),
        supportsEmbeddings: jest.fn(),
        embed: jest.fn(),
    };
    const quotasService = {
        getTier: jest.fn(),
    };

    let service: KnowledgeBaseService;

    beforeEach(() => {
        jest.clearAllMocks();
        openAiProvider.isConfigured.mockReturnValue(true);
        openAiProvider.supportsEmbeddings.mockReturnValue(true);
        openAiProvider.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
        chunkRepository.query.mockImplementation(async (sql: string) => {
            if (sql.includes('pg_extension')) {
                return [{ '?column?': 1 }];
            }
            return [];
        });
        service = new KnowledgeBaseService(
            chunkRepository as never,
            openAiProvider as never,
            quotasService as never,
        );
    });

    it('blocks org-private RAG upsert for non-enterprise tiers', async () => {
        quotasService.getTier.mockResolvedValue('professional');

        await expect(
            service.upsertOrgDocument('org-1', { title: 'Runbook', content: 'steps' }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(chunkRepository.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO ai_knowledge_chunks'),
            expect.anything(),
        );
    });

    it('returns empty results when pgvector is unavailable', async () => {
        chunkRepository.query.mockResolvedValue([]);
        quotasService.getTier.mockResolvedValue('basic');

        const rows = await service.search('org-1', 'how to connect aws');
        expect(rows).toEqual([]);
    });

    it('searches only global chunks when org-private RAG is disabled', async () => {
        quotasService.getTier.mockResolvedValue('basic');
        chunkRepository.query.mockImplementation(async (sql: string) => {
            if (sql.includes('pg_extension')) {
                return [{ '?column?': 1 }];
            }
            return [
                {
                    id: 'chunk-1',
                    title: 'Global',
                    content: 'docs',
                    source: 'saas_docs',
                    score: 0.9,
                },
            ];
        });

        const rows = await service.search('org-1', 'how to connect aws');

        expect(rows).toHaveLength(1);
        expect(chunkRepository.query).toHaveBeenCalledWith(
            expect.stringContaining('organization_id IS NULL'),
            expect.arrayContaining(['[0.1,0.2,0.3]', false, 'org-1', 5]),
        );
    });

    it('includes tenant-scoped chunks for enterprise', async () => {
        quotasService.getTier.mockResolvedValue('enterprise');
        chunkRepository.query.mockImplementation(async (sql: string) => {
            if (sql.includes('pg_extension')) {
                return [{ '?column?': 1 }];
            }
            return [];
        });

        await service.search('org-42', 'private runbook', 3);

        expect(chunkRepository.query).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining(['[0.1,0.2,0.3]', true, 'org-42', 3]),
        );
    });
});
