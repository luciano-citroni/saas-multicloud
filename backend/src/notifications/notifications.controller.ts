import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import type { Tenant } from '../db/entites/tenant.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';
import { parsePaginationQuery } from '../common/pagination/parse-pagination-query';
import {
    createNotificationEmailSchema,
    createNotificationGroupSchema,
    notificationChannelSchema,
    updateNotificationEmailSchema,
    updateNotificationGroupSchema,
    type CreateNotificationEmailDto,
    type CreateNotificationGroupDto,
    type UpdateNotificationEmailDto,
    type UpdateNotificationGroupDto,
} from './dto';
import {
    CreateNotificationEmailRequestDto,
    CreateNotificationGroupRequestDto,
    NotificationEmailResponseDto,
    NotificationGroupResponseDto,
    NotificationTestEmailResponseDto,
    NotificationTestGroupResponseDto,
    UpdateNotificationEmailRequestDto,
    UpdateNotificationGroupRequestDto,
} from './swagger.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'Organization UUID (tenant)',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get('groups')
    @ApiOperation({ summary: 'Listar grupos de notificação do tenant' })
    @ApiQuery({ name: 'channel', required: false, enum: ['email', 'whatsapp'] })
    @ApiPaginationQuery()
    @ApiResponse({ status: 200, type: [NotificationGroupResponseDto] })
    listGroups(
        @CurrentOrganization() org: Tenant,
        @Query('channel') channel?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const parsed = notificationChannelSchema.safeParse(channel ?? 'email');
        return this.notificationsService.listGroups(
            org.id,
            parsed.success ? parsed.data : 'email',
            parsePaginationQuery(page, limit),
        );
    }

    @Post('groups')
    @HttpCode(201)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Criar grupo de notificação' })
    @ApiBody({ type: CreateNotificationGroupRequestDto })
    @ApiResponse({ status: 201, type: NotificationGroupResponseDto })
    createGroup(
        @CurrentOrganization() org: Tenant,
        @Body(new ZodValidationPipe(createNotificationGroupSchema)) dto: CreateNotificationGroupDto,
    ): Promise<NotificationGroupResponseDto> {
        return this.notificationsService.createGroup(org.id, dto);
    }

    @Put('groups/:id')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Editar grupo de notificação' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiBody({ type: UpdateNotificationGroupRequestDto })
    @ApiResponse({ status: 200, type: NotificationGroupResponseDto })
    updateGroup(
        @CurrentOrganization() org: Tenant,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(updateNotificationGroupSchema)) dto: UpdateNotificationGroupDto,
    ): Promise<NotificationGroupResponseDto> {
        return this.notificationsService.updateGroup(id, org.id, dto);
    }

    @Delete('groups/:id')
    @HttpCode(204)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Remover grupo de notificação (e seus e-mails)' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 204, description: 'Removed' })
    async removeGroup(
        @CurrentOrganization() org: Tenant,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        await this.notificationsService.removeGroup(id, org.id);
    }

    @Post('groups/:groupId/emails')
    @HttpCode(201)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Adicionar e-mail a um grupo' })
    @ApiParam({ name: 'groupId', type: 'string', format: 'uuid' })
    @ApiBody({ type: CreateNotificationEmailRequestDto })
    @ApiResponse({ status: 201, type: NotificationEmailResponseDto })
    createEmail(
        @CurrentOrganization() org: Tenant,
        @Param('groupId', ParseUUIDPipe) groupId: string,
        @Body(new ZodValidationPipe(createNotificationEmailSchema)) dto: CreateNotificationEmailDto,
    ): Promise<NotificationEmailResponseDto> {
        return this.notificationsService.createEmail(groupId, org.id, dto);
    }

    @Post('groups/:id/test')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Enviar e-mail de teste para todos os destinatários ativos do grupo' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: NotificationTestGroupResponseDto })
    @ApiResponse({ status: 400, description: 'Group has no active emails' })
    @ApiResponse({ status: 503, description: 'Send failed' })
    sendGroupTest(
        @CurrentOrganization() org: Tenant,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<NotificationTestGroupResponseDto> {
        return this.notificationsService.sendTestGroupEmails(id, org.id);
    }

    @Put('emails/:id')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Editar e-mail de notificação' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiBody({ type: UpdateNotificationEmailRequestDto })
    @ApiResponse({ status: 200, type: NotificationEmailResponseDto })
    updateEmail(
        @CurrentOrganization() org: Tenant,
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(updateNotificationEmailSchema)) dto: UpdateNotificationEmailDto,
    ): Promise<NotificationEmailResponseDto> {
        return this.notificationsService.updateEmail(id, org.id, dto);
    }

    @Delete('emails/:id')
    @HttpCode(204)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Remover e-mail de notificação' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 204, description: 'Removed' })
    async removeEmail(
        @CurrentOrganization() org: Tenant,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        await this.notificationsService.removeEmail(id, org.id);
    }

    @Post('emails/:id/test')
    @HttpCode(200)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Enviar e-mail de teste' })
    @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: NotificationTestEmailResponseDto })
    sendTest(
        @CurrentOrganization() org: Tenant,
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<NotificationTestEmailResponseDto> {
        return this.notificationsService.sendTestEmail(id, org.id);
    }
}
