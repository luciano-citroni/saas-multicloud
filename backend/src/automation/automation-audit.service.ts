import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationAuditEvent } from '../db/entites/automation-audit-event.entity';
import { redactSensitive } from './bindings';

@Injectable()
export class AutomationAuditService {
    private readonly logger = new Logger(AutomationAuditService.name);

    constructor(
        @InjectRepository(AutomationAuditEvent)
        private readonly auditRepository: Repository<AutomationAuditEvent>,
    ) {}

    async record(event: {
        tenantId: string;
        actorId?: string | null;
        action: string;
        entityType: string;
        entityId?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<void> {
        try {
            await this.auditRepository.save(
                this.auditRepository.create({
                    tenantId: event.tenantId,
                    actorId: event.actorId ?? null,
                    action: event.action,
                    entityType: event.entityType,
                    entityId: event.entityId ?? null,
                    metadata: redactSensitive(event.metadata ?? {}, new Set()) as Record<string, unknown>,
                }),
            );
        } catch (error) {
            this.logger.error(`automation.audit.failed action=${event.action}`);
        }
    }
}
