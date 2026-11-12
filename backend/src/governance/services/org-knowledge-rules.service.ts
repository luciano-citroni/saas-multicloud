import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiKnowledgeChunk } from '../../db/entites/ai-knowledge-chunk.entity';
import {
    accumulateOrgKnowledgeRules,
    type OrgKnowledgeRules,
} from '../../cloud-intelligence/knowledge/knowledge-rule.schema';

/**
 * Reads structured knowledge-base rules for governance scans without importing
 * CloudIntelligenceModule (avoids Nest circular dependency).
 */
@Injectable()
export class OrgKnowledgeRulesService {
    constructor(
        @InjectRepository(AiKnowledgeChunk)
        private readonly chunkRepository: Repository<AiKnowledgeChunk>,
    ) {}

    async getOrgRules(
        organizationId: string,
        cloudAccountId?: string | null,
    ): Promise<OrgKnowledgeRules> {
        const rows = await this.chunkRepository.find({
            where: { organizationId },
            order: { updatedAt: 'DESC' },
            take: 200,
        });
        return accumulateOrgKnowledgeRules(rows, { cloudAccountId });
    }
}
