import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiHeader } from '@nestjs/swagger';

import { Throttle } from '@nestjs/throttler';

import { BillingService } from './billing.service';

import { SkipTenant, CurrentOrganization } from '../tenant/tenant.decorators';

import { TenantGuard } from '../tenant/tenant.guard';

import { RolesGuard } from '../rbac/roles.guard';

import { Roles } from '../rbac/roles.decorator';

import { OrgRole } from '../rbac/roles.enum';

import { Tenant } from '../db/entites/tenant.entity';

import { PlanDto, SubscriptionDto, PaymentMethodDto, SetupIntentDto, ChangePlanRequestDto, ChangePlanCheckoutSessionDto } from './dto/swagger.dto';
import {
    changePlanSchema,
    checkoutSessionQuerySchema,
    paymentMethodIdParamSchema,
    type ChangePlanDto,
    type CheckoutSessionQueryDto,
    type PaymentMethodIdParamDto,
} from './dto/dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'Tenant UUID', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    // =========================================================================
    // Plans — no tenant context required
    // =========================================================================

    @Get('plans')
    @SkipTenant()
    @ApiOperation({ summary: 'List all available plans from Stripe' })
    @ApiResponse({ status: 200, description: 'List of available plans', type: PlanDto, isArray: true })
    listPlans() {
        return this.billingService.listPlans();
    }

    // =========================================================================
    // Subscription — tenant-scoped
    // =========================================================================

    @Get('subscription')
    @ApiOperation({ summary: "Get current tenant's subscription and plan" })
    @ApiResponse({ status: 200, description: 'Current subscription details', type: SubscriptionDto })
    @ApiResponse({ status: 404, description: 'No subscription found' })
    getSubscription(@CurrentOrganization() tenant: Tenant, @Query(new ZodValidationPipe(checkoutSessionQuerySchema)) query?: CheckoutSessionQueryDto) {
        return this.billingService.getTenantSubscription(tenant.id, query?.checkoutSessionId);
    }

    @Put('subscription')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @ApiOperation({ summary: 'Create Stripe Checkout session to change the current tenant plan' })
    @ApiBody({ type: ChangePlanRequestDto })
    @ApiResponse({ status: 200, description: 'Checkout session created successfully', type: ChangePlanCheckoutSessionDto })
    @ApiResponse({ status: 400, description: 'Already on this plan or no active subscription' })
    @ApiResponse({ status: 403, description: 'Insufficient role — OWNER or ADMIN required' })
    changePlan(@CurrentOrganization() tenant: Tenant, @Body(new ZodValidationPipe(changePlanSchema)) body: ChangePlanDto) {
        return this.billingService.changeTenantPlan(tenant.id, body.priceId);
    }

    // =========================================================================
    // Payment Methods — tenant-scoped
    // =========================================================================

    @Get('payment-methods')
    @ApiOperation({ summary: "List tenant's saved payment methods (cards)" })
    @ApiResponse({ status: 200, description: 'List of saved payment methods', type: PaymentMethodDto, isArray: true })
    listPaymentMethods(@CurrentOrganization() tenant: Tenant) {
        return this.billingService.listTenantPaymentMethods(tenant.id);
    }

    @Post('payment-methods/setup-intent')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Create a Stripe SetupIntent to add a new card for the tenant' })
    @ApiResponse({ status: 200, description: 'SetupIntent created — use clientSecret in Stripe.js', type: SetupIntentDto })
    createSetupIntent(@CurrentOrganization() tenant: Tenant) {
        return this.billingService.createTenantSetupIntent(tenant.id);
    }

    @Post('payment-methods/:paymentMethodId/set-default')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: "Set a card as the tenant's default payment method" })
    @ApiResponse({ status: 200, description: 'Default payment method updated' })
    @ApiResponse({ status: 400, description: 'Payment method does not belong to this tenant' })
    setDefaultPaymentMethod(
        @CurrentOrganization() tenant: Tenant,
        @Param(new ZodValidationPipe(paymentMethodIdParamSchema)) params: PaymentMethodIdParamDto
    ) {
        return this.billingService.setTenantDefaultPaymentMethod(tenant.id, params.paymentMethodId);
    }

    @Delete('payment-methods/:paymentMethodId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Remove a saved payment method from the tenant' })
    @ApiResponse({ status: 200, description: 'Payment method removed' })
    @ApiResponse({ status: 400, description: 'Payment method does not belong to this tenant' })
    detachPaymentMethod(@CurrentOrganization() tenant: Tenant, @Param(new ZodValidationPipe(paymentMethodIdParamSchema)) params: PaymentMethodIdParamDto) {
        return this.billingService.detachTenantPaymentMethod(tenant.id, params.paymentMethodId);
    }
}
