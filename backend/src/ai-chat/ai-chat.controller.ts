import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RolesGuard } from '../rbac/roles.guard';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { TenantGuard } from '../tenant/tenant.guard';
import { Tenant } from '../db/entites/tenant.entity';
import { AiChatService } from './ai-chat.service';
import {
    conversationIdParamSchema,
    createConversationSchema,
    sendMessageSchema,
    type ConversationIdParam,
    type CreateConversationDto,
    type SendMessageDto,
} from './dto';
import {
    AiChatConversationDetailResponseDto,
    AiChatConversationResponseDto,
    CreateConversationRequestDto,
    SendMessageRequestDto,
} from './swagger.dto';

type AuthUser = { sub: string; sessionId: string };

@ApiTags('AI Chat')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'Organization UUID',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Controller('ai-chat')
export class AiChatController {
    constructor(private readonly aiChatService: AiChatService) {}

    @Get('conversations')
    @ApiOperation({ summary: 'List AI chat conversations for the current user' })
    @ApiResponse({ status: 200, type: [AiChatConversationResponseDto] })
    async listConversations(@CurrentOrganization() org: Tenant, @CurrentUser() user: AuthUser) {
        return this.aiChatService.listConversations(org.id, user.sub);
    }

    @Post('conversations')
    @HttpCode(201)
    @ApiOperation({ summary: 'Create a new AI chat conversation' })
    @ApiBody({ type: CreateConversationRequestDto })
    @ApiResponse({ status: 201, type: AiChatConversationResponseDto })
    async createConversation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createConversationSchema)) dto: CreateConversationDto,
    ) {
        return this.aiChatService.createConversation(org.id, user.sub, dto);
    }

    @Get('conversations/:id')
    @ApiOperation({ summary: 'Get conversation messages' })
    @ApiResponse({ status: 200, type: AiChatConversationDetailResponseDto })
    @ApiResponse({ status: 404, description: 'Conversation not found' })
    async getConversation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(conversationIdParamSchema)) params: ConversationIdParam,
    ) {
        const { conversation, messages } = await this.aiChatService.getConversation(
            params.id,
            org.id,
            user.sub,
        );
        return {
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messages: messages
                .filter((message) => message.role === 'user' || message.role === 'assistant')
                .map((message) => ({
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    sources: message.sources,
                    createdAt: message.createdAt,
                })),
        };
    }

    @Delete('conversations/:id')
    @HttpCode(204)
    @ApiOperation({ summary: 'Delete a conversation owned by the current user' })
    @ApiResponse({ status: 204, description: 'Deleted' })
    async deleteConversation(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(conversationIdParamSchema)) params: ConversationIdParam,
    ) {
        await this.aiChatService.deleteConversation(params.id, org.id, user.sub);
    }

    @Post('conversations/:id/messages')
    @ApiOperation({ summary: 'Send a message and stream the assistant response (SSE)' })
    @ApiBody({ type: SendMessageRequestDto })
    @ApiResponse({ status: 200, description: 'text/event-stream' })
    async sendMessage(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(conversationIdParamSchema)) params: ConversationIdParam,
        @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
        @Res() res: Response,
    ) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        try {
            for await (const event of this.aiChatService.streamMessage(params.id, org.id, user.sub, dto)) {
                res.write(`event: ${event.event}\n`);
                res.write(`data: ${JSON.stringify(event.data)}\n\n`);
                if (typeof (res as Response & { flush?: () => void }).flush === 'function') {
                    (res as Response & { flush: () => void }).flush();
                }
            }
        } catch (error) {
            const message =
                error instanceof Error && error.message && !/secret|token|key|password|credential/i.test(error.message)
                    ? error.message
                    : 'Não foi possível gerar a resposta. Tente novamente.';
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ message })}\n\n`);
        } finally {
            res.end();
        }
    }

    @Post('conversations/:id/cancel')
    @HttpCode(200)
    @ApiOperation({ summary: 'Cancel an in-progress generation' })
    async cancelGeneration(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param(new ZodValidationPipe(conversationIdParamSchema)) params: ConversationIdParam,
    ) {
        // Ensure conversation belongs to user/org before cancelling.
        await this.aiChatService.getConversation(params.id, org.id, user.sub);
        const cancelled = this.aiChatService.cancelGeneration(params.id, user.sub);
        return { cancelled };
    }
}
