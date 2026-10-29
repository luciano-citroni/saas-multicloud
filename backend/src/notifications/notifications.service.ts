import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';

import { OrganizationNotificationEmail } from '../db/entites/organization-notification-email.entity';
import {
    OrganizationNotificationGroup,
    type NotificationChannel,
} from '../db/entites/organization-notification-group.entity';
import { OrganizationNotificationWhatsappTarget } from '../db/entites/organization-notification-whatsapp-target.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import { MailerService } from '../mailer/mailer.service';
import type {
    CreateNotificationEmailDto,
    CreateNotificationGroupDto,
    CreateNotificationWhatsappTargetDto,
    JoinWhatsappGroupInviteDto,
    UpdateNotificationEmailDto,
    UpdateNotificationGroupDto,
    UpdateNotificationWhatsappTargetDto,
} from './dto';
import {
    buildPaginationMeta,
    normalizePagination,
    type PaginatedResult,
    type PaginationInput,
} from '../common/pagination/paginate';
import { EvolutionApiService } from './evolution-api.service';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectRepository(OrganizationNotificationGroup)
        private readonly groupRepo: Repository<OrganizationNotificationGroup>,
        @InjectRepository(OrganizationNotificationEmail)
        private readonly emailRepo: Repository<OrganizationNotificationEmail>,
        @InjectRepository(OrganizationNotificationWhatsappTarget)
        private readonly whatsappTargetRepo: Repository<OrganizationNotificationWhatsappTarget>,
        private readonly mailerService: MailerService,
        private readonly evolutionApiService: EvolutionApiService,
    ) {}

    async listGroups(
        organizationId: string,
        channel: NotificationChannel = 'email',
        paginationInput: PaginationInput = {},
    ): Promise<PaginatedResult<OrganizationNotificationGroup>> {
        const { page, limit } = normalizePagination(paginationInput);
        const totalItems = await this.groupRepo.count({ where: { organizationId, channel } });
        const pagination = buildPaginationMeta(totalItems, page, limit);

        const items = await this.groupRepo.find({
            where: { organizationId, channel },
            relations: channel === 'whatsapp' ? ['whatsappTargets'] : ['emails'],
            order: {
                createdAt: 'DESC',
                ...(channel === 'whatsapp'
                    ? { whatsappTargets: { createdAt: 'ASC' as const } }
                    : { emails: { createdAt: 'ASC' as const } }),
            },
            skip: (pagination.page - 1) * limit,
            take: limit,
        });

        return { items, pagination };
    }

    async findGroupOrFail(
        id: string,
        organizationId: string,
    ): Promise<OrganizationNotificationGroup> {
        const group = await this.groupRepo.findOne({
            where: { id, organizationId },
            relations: ['emails', 'whatsappTargets'],
        });
        if (!group) {
            throw new NotFoundException(ErrorMessages.NOTIFICATIONS.GROUP_NOT_FOUND);
        }
        return group;
    }

    async createGroup(
        organizationId: string,
        dto: CreateNotificationGroupDto,
    ): Promise<OrganizationNotificationGroup> {
        const group = this.groupRepo.create({
            organizationId,
            name: dto.name.trim(),
            description: dto.description?.trim() ? dto.description.trim() : null,
            channel: dto.channel ?? 'email',
            isActive: dto.isActive ?? true,
        });

        try {
            const saved = await this.groupRepo.save(group);
            return this.findGroupOrFail(saved.id, organizationId);
        } catch (error) {
            this.rethrowUniqueConflict(error, 'group');
            throw error;
        }
    }

    async updateGroup(
        id: string,
        organizationId: string,
        dto: UpdateNotificationGroupDto,
    ): Promise<OrganizationNotificationGroup> {
        const group = await this.findGroupOrFail(id, organizationId);

        if (dto.name !== undefined) group.name = dto.name.trim();
        if (dto.description !== undefined) {
            group.description = dto.description?.trim() ? dto.description.trim() : null;
        }
        if (dto.isActive !== undefined) group.isActive = dto.isActive;

        try {
            await this.groupRepo.save(group);
            return this.findGroupOrFail(id, organizationId);
        } catch (error) {
            this.rethrowUniqueConflict(error, 'group');
            throw error;
        }
    }

    async removeGroup(id: string, organizationId: string): Promise<void> {
        const group = await this.findGroupOrFail(id, organizationId);
        await this.groupRepo.remove(group);
        this.logger.log(`notification.group.removed id=${id} org=${organizationId}`);
    }

    async findEmailOrFail(
        id: string,
        organizationId: string,
    ): Promise<OrganizationNotificationEmail> {
        const entity = await this.emailRepo.findOne({ where: { id, organizationId } });
        if (!entity) {
            throw new NotFoundException(ErrorMessages.NOTIFICATIONS.EMAIL_NOT_FOUND);
        }
        return entity;
    }

    async createEmail(
        groupId: string,
        organizationId: string,
        dto: CreateNotificationEmailDto,
    ): Promise<OrganizationNotificationEmail> {
        const group = await this.findGroupOrFail(groupId, organizationId);
        if (group.channel !== 'email') {
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.CHANNEL_MISMATCH);
        }

        const entity = this.emailRepo.create({
            organizationId,
            groupId: group.id,
            email: dto.email.trim().toLowerCase(),
            label: dto.label?.trim() ? dto.label.trim() : null,
            isActive: dto.isActive ?? true,
        });

        try {
            return await this.emailRepo.save(entity);
        } catch (error) {
            this.rethrowUniqueConflict(error, 'email');
            throw error;
        }
    }

    async updateEmail(
        id: string,
        organizationId: string,
        dto: UpdateNotificationEmailDto,
    ): Promise<OrganizationNotificationEmail> {
        const entity = await this.findEmailOrFail(id, organizationId);

        if (dto.email !== undefined) entity.email = dto.email.trim().toLowerCase();
        if (dto.label !== undefined) {
            entity.label = dto.label?.trim() ? dto.label.trim() : null;
        }
        if (dto.isActive !== undefined) entity.isActive = dto.isActive;

        try {
            return await this.emailRepo.save(entity);
        } catch (error) {
            this.rethrowUniqueConflict(error, 'email');
            throw error;
        }
    }

    async removeEmail(id: string, organizationId: string): Promise<void> {
        const entity = await this.findEmailOrFail(id, organizationId);
        await this.emailRepo.remove(entity);
        this.logger.log(`notification.email.removed id=${id} org=${organizationId}`);
    }

    async findWhatsappTargetOrFail(
        id: string,
        organizationId: string,
    ): Promise<OrganizationNotificationWhatsappTarget> {
        const entity = await this.whatsappTargetRepo.findOne({ where: { id, organizationId } });
        if (!entity) {
            throw new NotFoundException(ErrorMessages.NOTIFICATIONS.WHATSAPP_TARGET_NOT_FOUND);
        }
        return entity;
    }

    async createWhatsappTarget(
        groupId: string,
        organizationId: string,
        dto: CreateNotificationWhatsappTargetDto,
    ): Promise<OrganizationNotificationWhatsappTarget> {
        const group = await this.findGroupOrFail(groupId, organizationId);
        if (group.channel !== 'whatsapp') {
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.CHANNEL_MISMATCH);
        }

        const entity = this.whatsappTargetRepo.create({
            organizationId,
            groupId: group.id,
            targetType: dto.targetType,
            target: dto.target,
            label: dto.label?.trim() ? dto.label.trim() : null,
            isActive: dto.isActive ?? true,
        });

        try {
            return await this.whatsappTargetRepo.save(entity);
        } catch (error) {
            this.rethrowUniqueConflict(error, 'whatsapp');
            throw error;
        }
    }

    /**
     * Entra no grupo via link/código de convite (Evolution) e salva automaticamente o JID.
     */
    async joinWhatsappGroupByInvite(
        groupId: string,
        organizationId: string,
        dto: JoinWhatsappGroupInviteDto,
    ): Promise<OrganizationNotificationWhatsappTarget> {
        const group = await this.findGroupOrFail(groupId, organizationId);
        if (group.channel !== 'whatsapp') {
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.CHANNEL_MISMATCH);
        }

        const { groupJid } = await this.evolutionApiService.acceptGroupInvite(dto.inviteLink);

        const existing = await this.whatsappTargetRepo.findOne({
            where: {
                groupId: group.id,
                targetType: 'group',
                target: groupJid,
            },
        });

        if (existing) {
            if (dto.label !== undefined) {
                existing.label = dto.label?.trim() ? dto.label.trim() : null;
            }
            if (dto.isActive !== undefined) {
                existing.isActive = dto.isActive;
            } else if (!existing.isActive) {
                existing.isActive = true;
            }
            return this.whatsappTargetRepo.save(existing);
        }

        const entity = this.whatsappTargetRepo.create({
            organizationId,
            groupId: group.id,
            targetType: 'group',
            target: groupJid,
            label: dto.label?.trim() ? dto.label.trim() : null,
            isActive: dto.isActive ?? true,
        });

        try {
            const saved = await this.whatsappTargetRepo.save(entity);
            this.logger.log(
                `notification.whatsapp.joined group=${group.id} org=${organizationId} jid=${groupJid}`,
            );
            return saved;
        } catch (error) {
            this.rethrowUniqueConflict(error, 'whatsapp');
            throw error;
        }
    }

    async updateWhatsappTarget(
        id: string,
        organizationId: string,
        dto: UpdateNotificationWhatsappTargetDto,
    ): Promise<OrganizationNotificationWhatsappTarget> {
        const entity = await this.findWhatsappTargetOrFail(id, organizationId);

        if (dto.targetType !== undefined) entity.targetType = dto.targetType;
        if (dto.target !== undefined) entity.target = dto.target;
        if (dto.label !== undefined) {
            entity.label = dto.label?.trim() ? dto.label.trim() : null;
        }
        if (dto.isActive !== undefined) entity.isActive = dto.isActive;

        try {
            return await this.whatsappTargetRepo.save(entity);
        } catch (error) {
            this.rethrowUniqueConflict(error, 'whatsapp');
            throw error;
        }
    }

    async removeWhatsappTarget(id: string, organizationId: string): Promise<void> {
        const entity = await this.findWhatsappTargetOrFail(id, organizationId);
        await this.whatsappTargetRepo.remove(entity);
        this.logger.log(`notification.whatsapp.removed id=${id} org=${organizationId}`);
    }

    async sendTestEmail(
        id: string,
        organizationId: string,
    ): Promise<{ sent: boolean; email: string }> {
        const entity = await this.findEmailOrFail(id, organizationId);
        const group = await this.findGroupOrFail(entity.groupId, organizationId);

        try {
            await this.mailerService.sendNotificationTestEmail({
                to: entity.email,
                label: entity.label ?? group.name,
            });
            this.logger.log(`notification.test.sent id=${id} email=${entity.email}`);
            return { sent: true, email: entity.email };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`notification.test.failed id=${id}: ${message}`);
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.TEST_SEND_FAILED);
        }
    }

    async sendTestWhatsappTarget(
        id: string,
        organizationId: string,
    ): Promise<{ sent: boolean; target: string; targetType: string }> {
        const entity = await this.findWhatsappTargetOrFail(id, organizationId);
        const group = await this.findGroupOrFail(entity.groupId, organizationId);

        try {
            await this.evolutionApiService.sendText({
                number: entity.target,
                text: this.buildWhatsappTestMessage(group.name, entity.label),
            });
            this.logger.log(
                `notification.whatsapp.test.sent id=${id} target=${entity.target} type=${entity.targetType}`,
            );
            return { sent: true, target: entity.target, targetType: entity.targetType };
        } catch (error) {
            if (error instanceof ServiceUnavailableException) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`notification.whatsapp.test.failed id=${id}: ${message}`);
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.WHATSAPP_TEST_SEND_FAILED);
        }
    }

    async sendTestGroup(
        groupId: string,
        organizationId: string,
    ): Promise<{ sent: number; failed: number; emails?: string[]; targets?: string[] }> {
        const group = await this.findGroupOrFail(groupId, organizationId);

        if (group.channel === 'whatsapp') {
            return this.sendTestGroupWhatsapp(group);
        }

        return this.sendTestGroupEmails(group);
    }

    async listActiveWhatsappTargets(
        organizationId: string,
    ): Promise<OrganizationNotificationWhatsappTarget[]> {
        return this.whatsappTargetRepo
            .createQueryBuilder('target')
            .innerJoin('target.group', 'group')
            .where('target.organization_id = :organizationId', { organizationId })
            .andWhere('target.is_active = true')
            .andWhere('group.is_active = true')
            .andWhere('group.channel = :channel', { channel: 'whatsapp' })
            .orderBy('target.created_at', 'ASC')
            .getMany();
    }

    async findGroupsByIds(
        organizationId: string,
        groupIds: string[],
    ): Promise<OrganizationNotificationGroup[]> {
        const uniqueIds = [...new Set(groupIds.filter(Boolean))];
        if (uniqueIds.length === 0) {
            return [];
        }

        return this.groupRepo.find({
            where: {
                organizationId,
                id: In(uniqueIds),
            },
        });
    }

    async listActiveEmailsFromGroups(
        organizationId: string,
        groupIds: string[],
    ): Promise<string[]> {
        const uniqueIds = [...new Set(groupIds.filter(Boolean))];
        if (uniqueIds.length === 0) {
            return [];
        }

        const emails = await this.emailRepo
            .createQueryBuilder('email')
            .innerJoin('email.group', 'group')
            .where('email.organization_id = :organizationId', { organizationId })
            .andWhere('email.group_id IN (:...groupIds)', { groupIds: uniqueIds })
            .andWhere('email.is_active = true')
            .andWhere('group.is_active = true')
            .andWhere('group.channel = :channel', { channel: 'email' })
            .getMany();

        return [...new Set(emails.map((entry) => entry.email.toLowerCase()))];
    }

    async listActiveWhatsappTargetsFromGroups(
        organizationId: string,
        groupIds: string[],
    ): Promise<OrganizationNotificationWhatsappTarget[]> {
        const uniqueIds = [...new Set(groupIds.filter(Boolean))];
        if (uniqueIds.length === 0) {
            return [];
        }

        return this.whatsappTargetRepo
            .createQueryBuilder('target')
            .innerJoin('target.group', 'group')
            .where('target.organization_id = :organizationId', { organizationId })
            .andWhere('target.group_id IN (:...groupIds)', { groupIds: uniqueIds })
            .andWhere('target.is_active = true')
            .andWhere('group.is_active = true')
            .andWhere('group.channel = :channel', { channel: 'whatsapp' })
            .orderBy('target.created_at', 'ASC')
            .getMany();
    }

    async sendWhatsappAlertToTargets(
        organizationId: string,
        text: string,
        targets: OrganizationNotificationWhatsappTarget[],
    ): Promise<{ sent: number; failed: number }> {
        if (targets.length === 0) {
            return { sent: 0, failed: 0 };
        }

        let sent = 0;
        let failed = 0;

        for (const target of targets) {
            try {
                await this.evolutionApiService.sendText({
                    number: target.target,
                    text,
                });
                sent += 1;
            } catch (error) {
                failed += 1;
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    `notification.whatsapp.alert.failed org=${organizationId} target=${target.target}: ${message}`,
                );
            }
        }

        this.logger.log(
            `notification.whatsapp.alert.org=${organizationId} sent=${sent} failed=${failed}`,
        );

        return { sent, failed };
    }

    async sendWhatsappAlertToOrganization(
        organizationId: string,
        text: string,
    ): Promise<{ sent: number; failed: number }> {
        const targets = await this.listActiveWhatsappTargets(organizationId);
        return this.sendWhatsappAlertToTargets(organizationId, text, targets);
    }

    async sendWhatsappAlertToGroups(
        organizationId: string,
        groupIds: string[],
        text: string,
    ): Promise<{ sent: number; failed: number }> {
        const targets = await this.listActiveWhatsappTargetsFromGroups(organizationId, groupIds);
        return this.sendWhatsappAlertToTargets(organizationId, text, targets);
    }

    private async sendTestGroupEmails(
        group: OrganizationNotificationGroup,
    ): Promise<{ sent: number; failed: number; emails: string[] }> {
        const recipients = (group.emails ?? []).filter((email) => email.isActive);

        if (recipients.length === 0) {
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.GROUP_HAS_NO_ACTIVE_EMAILS);
        }

        let sent = 0;
        let failed = 0;
        const emails: string[] = [];

        for (const recipient of recipients) {
            try {
                await this.mailerService.sendNotificationTestEmail({
                    to: recipient.email,
                    label: recipient.label ?? group.name,
                });
                sent += 1;
                emails.push(recipient.email);
            } catch (error) {
                failed += 1;
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    `notification.group.test.failed group=${group.id} email=${recipient.email}: ${message}`,
                );
            }
        }

        if (sent === 0) {
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.TEST_SEND_FAILED);
        }

        this.logger.log(
            `notification.group.test.sent group=${group.id} sent=${sent} failed=${failed}`,
        );

        return { sent, failed, emails };
    }

    private async sendTestGroupWhatsapp(
        group: OrganizationNotificationGroup,
    ): Promise<{ sent: number; failed: number; targets: string[] }> {
        const recipients = (group.whatsappTargets ?? []).filter((target) => target.isActive);

        if (recipients.length === 0) {
            throw new BadRequestException(
                ErrorMessages.NOTIFICATIONS.GROUP_HAS_NO_ACTIVE_WHATSAPP_TARGETS,
            );
        }

        let sent = 0;
        let failed = 0;
        const targets: string[] = [];

        for (const recipient of recipients) {
            try {
                await this.evolutionApiService.sendText({
                    number: recipient.target,
                    text: this.buildWhatsappTestMessage(group.name, recipient.label),
                });
                sent += 1;
                targets.push(recipient.target);
            } catch (error) {
                failed += 1;
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    `notification.group.whatsapp.test.failed group=${group.id} target=${recipient.target}: ${message}`,
                );
            }
        }

        if (sent === 0) {
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.WHATSAPP_TEST_SEND_FAILED);
        }

        this.logger.log(
            `notification.group.whatsapp.test.sent group=${group.id} sent=${sent} failed=${failed}`,
        );

        return { sent, failed, targets };
    }

    private buildWhatsappTestMessage(groupName: string, label: string | null): string {
        const destination = label?.trim() ? ` (${label.trim()})` : '';
        return [
            `*SaaS MultiCloud* — teste de WhatsApp`,
            ``,
            `Grupo: ${groupName}${destination}`,
            `Se você recebeu esta mensagem, o canal está configurado corretamente.`,
        ].join('\n');
    }

    private rethrowUniqueConflict(error: unknown, kind: 'group' | 'email' | 'whatsapp'): void {
        if (error instanceof QueryFailedError) {
            const detail = (error as QueryFailedError & { detail?: string }).detail ?? '';
            const code = (error as QueryFailedError & { code?: string }).code;
            if (code === '23505' || detail.toLowerCase().includes('unique')) {
                throw new ConflictException(
                    kind === 'group'
                        ? ErrorMessages.NOTIFICATIONS.GROUP_ALREADY_EXISTS
                        : kind === 'email'
                          ? ErrorMessages.NOTIFICATIONS.EMAIL_ALREADY_EXISTS
                          : ErrorMessages.NOTIFICATIONS.WHATSAPP_TARGET_ALREADY_EXISTS,
                );
            }
        }
    }
}
