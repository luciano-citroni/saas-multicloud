import { Controller, Post, Headers, HttpCode, HttpStatus, Logger, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { Public } from '../auth/decorators';
import { SkipTenant } from '../tenant/tenant.decorators';

/**
 * Handles incoming Stripe webhook events.
 *
 * This endpoint is intentionally PUBLIC — Stripe calls it server-to-server.
 * Authenticity is verified via HMAC signature using STRIPE_WEBHOOK_SECRET.
 *
 * Requires rawBody to be enabled in the NestJS app (rawBody: true in NestFactory.create).
 */
@ApiTags('Billing')
@Controller('billing')
export class BillingWebhookController {
    private readonly logger = new Logger(BillingWebhookController.name);

    constructor(private readonly billingService: BillingService) {}

    @Post('webhooks')
    @Public()
    @SkipTenant()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Stripe webhook endpoint (internal — do not call directly)' })
    @ApiResponse({ status: 200, description: 'Event processed' })
    @ApiResponse({ status: 400, description: 'Invalid signature' })
    async handleWebhook(@Req() req: Request, @Headers('stripe-signature') signature: string): Promise<{ received: boolean }> {
        const rawBody = (req as any).rawBody as Buffer | undefined;

        if (!rawBody) {
            this.logger.error('Raw body not available. Ensure rawBody: true is set in NestFactory.create');
            throw new BadRequestException('Raw body not available for webhook verification');
        }

        await this.billingService.handleWebhookEvent(rawBody, signature);
        return { received: true };
    }
}
