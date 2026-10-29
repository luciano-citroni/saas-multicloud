import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { OrganizationNotificationEmail } from '../db/entites/organization-notification-email.entity';
import {
    OrganizationNotificationGroup,
    type NotificationChannel,
} from '../db/entites/organization-notification-group.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import { MailerService } from '../mailer/mailer.service';
import type {
    CreateNotificationEmailDto,
    CreateNotificationGroupDto,
    UpdateNotificationEmailDto,
    UpdateNotificationGroupDto,
} from './dto';
import {
    buildPaginationMeta,
    normalizePagination,
    type PaginatedResult,
    type PaginationInput,
} from '../common/pagination/paginate';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectRepository(OrganizationNotificationGroup)
        private readonly groupRepo: Repository<OrganizationNotificationGroup>,
        @InjectRepository(OrganizationNotificationEmail)
        private readonly emailRepo: Repository<OrganizationNotificationEmail>,
        private readonly mailerService: MailerService,
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
            relations: ['emails'],
            order: { createdAt: 'DESC', emails: { createdAt: 'ASC' } },
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
            relations: ['emails'],
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
        if (dto.channel === 'whatsapp') {
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.WHATSAPP_NOT_IMPLEMENTED);
        }

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
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.WHATSAPP_NOT_IMPLEMENTED);
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

    async sendTestGroupEmails(
        groupId: string,
        organizationId: string,
    ): Promise<{ sent: number; failed: number; emails: string[] }> {
        const group = await this.findGroupOrFail(groupId, organizationId);
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
                    `notification.group.test.failed group=${groupId} email=${recipient.email}: ${message}`,
                );
            }
        }

        if (sent === 0) {
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.TEST_SEND_FAILED);
        }

        this.logger.log(
            `notification.group.test.sent group=${groupId} sent=${sent} failed=${failed}`,
        );

        return { sent, failed, emails };
    }

    private rethrowUniqueConflict(error: unknown, kind: 'group' | 'email'): void {
        if (error instanceof QueryFailedError) {
            const detail = (error as QueryFailedError & { detail?: string }).detail ?? '';
            const code = (error as QueryFailedError & { code?: string }).code;
            if (code === '23505' || detail.toLowerCase().includes('unique')) {
                throw new ConflictException(
                    kind === 'group'
                        ? ErrorMessages.NOTIFICATIONS.GROUP_ALREADY_EXISTS
                        : ErrorMessages.NOTIFICATIONS.EMAIL_ALREADY_EXISTS,
                );
            }
        }
    }
}
