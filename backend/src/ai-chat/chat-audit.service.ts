import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiChatAuditEvent } from '../db/entites/ai-chat-audit-event.entity';

const SENSITIVE_KEYS = new Set([
    'password',
    'token',
    'secret',
    'credential',
    'credentials',
    'apikey',
    'api_key',
    'authorization',
    'clientsecret',
    'private_key',
    'privatekey',
]);

function redact(value: unknown, depth = 0): unknown {
    if (depth > 4) {
        return '[truncated]';
    }
    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => redact(item, depth + 1));
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[^a-z0-9_]/g, ''))) {
                out[key] = '[redacted]';
            } else {
                out[key] = redact(nested, depth + 1);
            }
        }
        return out;
    }
    if (typeof value === 'string' && value.length > 500) {
        return `${value.slice(0, 500)}…`;
    }
    return value;
}

@Injectable()
export class ChatAuditService {
    private readonly logger = new Logger(ChatAuditService.name);

    constructor(
        @InjectRepository(AiChatAuditEvent)
        private readonly auditRepository: Repository<AiChatAuditEvent>,
    ) {}

    async record(event: {
        organizationId: string;
        actorId?: string | null;
        action: string;
        entityType: string;
        entityId?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<void> {
        try {
            await this.auditRepository.save(
                this.auditRepository.create({
                    organizationId: event.organizationId,
                    actorId: event.actorId ?? null,
                    action: event.action,
                    entityType: event.entityType,
                    entityId: event.entityId ?? null,
                    metadata: (redact(event.metadata ?? {}) as Record<string, unknown>) ?? {},
                }),
            );
        } catch (error) {
            this.logger.error(`ai-chat.audit.failed action=${event.action}`);
        }
    }
}
