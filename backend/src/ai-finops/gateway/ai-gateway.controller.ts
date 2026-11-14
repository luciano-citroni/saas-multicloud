import {
    BadRequestException,
    Body,
    Controller,
    Headers,
    HttpCode,
    Post,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../auth/decorators';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiGatewayService } from './ai-gateway.service';

type ChatCompletionBody = {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    provider?: string;
    connectionId?: string;
};

@ApiExcludeController()
@Controller('ai-gateway/v1')
export class AiGatewayController {
    constructor(private readonly gatewayService: AiGatewayService) {}

    @Public()
    @Post('chat/completions')
    @HttpCode(200)
    async chatCompletions(
        @Headers('authorization') authorization: string | undefined,
        @Body() body: ChatCompletionBody,
        @Req() req: { headers: Record<string, string | string[] | undefined> },
        @Res({ passthrough: true }) res: Response,
    ) {
        const rawKey = this.extractApiKey(authorization);
        if (!rawKey) {
            throw new UnauthorizedException(ErrorMessages.AI_FINOPS.API_KEY_INVALID);
        }
        if (!body?.model || !Array.isArray(body.messages)) {
            throw new BadRequestException(ErrorMessages.GENERAL.BAD_REQUEST);
        }

        const requestIdHeader = String(req.headers['x-request-id'] ?? '');

        if (body.stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            await this.gatewayService.chatCompletionsStream({
                rawApiKey: rawKey,
                body,
                requestIdHeader,
                write: (chunk) => {
                    res.write(chunk);
                },
                end: () => {
                    res.end();
                },
            });
            return;
        }

        return this.gatewayService.chatCompletions({
            rawApiKey: rawKey,
            body,
            requestIdHeader,
        });
    }

    private extractApiKey(authorization?: string): string | null {
        if (!authorization) return null;
        const [scheme, token] = authorization.split(' ');
        if (scheme?.toLowerCase() === 'bearer' && token) return token.trim();
        if (authorization.startsWith('smc_ai_')) return authorization.trim();
        return null;
    }
}
