import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsAuditLog } from '../../db/entites/ai-finops-audit-log.entity';

@Injectable()
export class AiFinopsAuditService {
    constructor(
        @InjectRepository(AiFinopsAuditLog)
        private readonly auditRepository: Repository<AiFinopsAuditLog>,
    ) {}

    async log(input: {
        tenantId: string;
        userId?: string | null;
        action: string;
        entityType: string;
        entityId?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<void> {
        const row = this.auditRepository.create({
            tenantId: input.tenantId,
            userId: input.userId ?? null,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            metadata: input.metadata ?? {},
        });
        await this.auditRepository.save(row);
    }
}
