import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsAlert } from '../../db/entites/ai-finops-alert.entity';
import { AiFinopsConnection } from '../../db/entites/ai-finops-connection.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { MailerService } from '../../mailer/mailer.service';

@Injectable()
export class AiFinopsAlertDispatchService {
    private readonly logger = new Logger(AiFinopsAlertDispatchService.name);

    constructor(
        @InjectRepository(AiFinopsAlert)
        private readonly alertRepository: Repository<AiFinopsAlert>,
        @InjectRepository(AiFinopsConnection)
        private readonly connectionRepository: Repository<AiFinopsConnection>,
        private readonly notificationsService: NotificationsService,
        private readonly mailerService: MailerService,
    ) {}

    async emit(input: {
        tenantId: string;
        organizationId: string;
        alertType: string;
        scopeType?: string | null;
        scopeId?: string | null;
        dedupeKey: string;
        message: string;
        notificationGroupIds?: string[];
        channels?: string[];
        emailPayload?: {
            budgetName: string;
            usagePercentage: number;
            currentSpend: number;
            limitAmount: number;
            currency: string;
            triggeredAlerts: number[];
            scope: string;
        };
    }): Promise<boolean> {
        const existing = await this.alertRepository.findOne({
            where: {
                tenantId: input.tenantId,
                alertType: input.alertType,
                scopeType: input.scopeType ?? undefined,
                scopeId: input.scopeId ?? undefined,
                dedupeKey: input.dedupeKey,
            },
        });
        if (existing) return false;

        await this.alertRepository.save(
            this.alertRepository.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                alertType: input.alertType,
                scopeType: input.scopeType ?? null,
                scopeId: input.scopeId ?? null,
                dedupeKey: input.dedupeKey,
                message: input.message,
                status: 'open',
                triggeredAt: new Date(),
            }),
        );

        const channels = input.channels ?? ['email'];
        const groupIds = input.notificationGroupIds ?? [];
        if (!groupIds.length) return true;

        try {
            if (channels.includes('whatsapp')) {
                await this.notificationsService.sendWhatsappAlertToGroups(
                    input.organizationId,
                    groupIds,
                    input.message,
                );
            }
            if (channels.includes('email')) {
                const emails = await this.notificationsService.listActiveEmailsFromGroups(
                    input.organizationId,
                    groupIds,
                );
                if (emails.length && input.emailPayload) {
                    await this.mailerService.sendFinopsBudgetAlert({
                        to: emails,
                        ...input.emailPayload,
                    });
                } else if (emails.length) {
                    await this.mailerService.sendFinopsBudgetAlert({
                        to: emails,
                        budgetName: input.alertType,
                        usagePercentage: 0,
                        currentSpend: 0,
                        limitAmount: 0,
                        currency: 'USD',
                        triggeredAlerts: [],
                        scope: 'organization',
                    });
                }
            }
        } catch (error) {
            this.logger.warn(
                `alert.dispatch.failed type=${input.alertType}: ${error instanceof Error ? error.message : 'error'}`,
            );
        }
        return true;
    }

    async scanSyncAndCredentialFailures(): Promise<void> {
        const failed = await this.connectionRepository
            .createQueryBuilder('connection')
            .where('connection.status = :error', { error: 'error' })
            .orWhere('connection.last_sync_status = :failed', { failed: 'failed' })
            .take(200)
            .getMany();

        for (const connection of failed) {
            await this.emit({
                tenantId: connection.tenantId,
                organizationId: connection.organizationId,
                alertType: connection.status === 'error' ? 'credential_invalid' : 'sync_failed',
                scopeType: 'connection',
                scopeId: connection.id,
                dedupeKey: `${connection.id}:${connection.lastSyncAt?.toISOString() ?? 'none'}`,
                message: `AI connection "${connection.name}" reported ${connection.statusMessage ?? connection.lastSyncStatus}.`,
            });
        }
    }
}
