import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader, ApiBody } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';

import { BillingService } from './billing.service';

import { TenantGuard } from '../tenant/tenant.guard';

import { RolesGuard } from '../rbac/roles.guard';

import { Roles } from '../rbac/roles.decorator';

import { OrgRole } from '../rbac/roles.enum';

import { CurrentOrganization } from '../tenant/tenant.decorators';

import { Organization } from '../db/entites/organization.entity';

import {
    PlanDto,
    SubscriptionDto,
    PaymentMethodDto,
    SetupIntentDto,
    ChangePlanRequestDto,
    ChangePlanCheckoutSessionDto,
    SetDefaultPaymentMethodRequestDto,
} from './dto/swagger.dto';

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@Controller('billing')
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    // =========================================================================

    // Plans and Subscription management endpoints are public to all authenticated users of the organization, but changing plans and managing payment methods are restricted to OWNER/ADMIN roles only.

    // =========================================================================

    @Get('plans')
    @ApiPaginationQuery()
    @UseGuards(TenantGuard)
    @ApiOperation({ summary: 'List all available plans from Stripe' })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiResponse({ status: 200, description: 'List of available plans', type: PlanDto, isArray: true })
    listPlans(@CurrentOrganization() org: Organization) {
        return this.billingService.listPlans(org.id);
    }

    // =========================================================================
    //
    // Subscription management endpoints
    //
    // =========================================================================

    @Get('subscription')
    @UseGuards(TenantGuard)
    @ApiOperation({ summary: "Get current organization's subscription" })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiResponse({ status: 200, description: 'Current subscription details', type: SubscriptionDto })
    @ApiResponse({ status: 404, description: 'No subscription found' })
    getSubscription(@CurrentOrganization() org: Organization, @Query('checkoutSessionId') checkoutSessionId?: string) {
        return this.billingService.getSubscription(org.id, checkoutSessionId);
    }

    @Put('subscription')
    @UseGuards(TenantGuard, RolesGuard)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Create Stripe Checkout session to change the current plan (OWNER/ADMIN only)' })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiBody({ type: ChangePlanRequestDto })
    @ApiResponse({ status: 200, description: 'Checkout session created successfully', type: ChangePlanCheckoutSessionDto })
    @ApiResponse({ status: 400, description: 'Already on this plan or no active subscription' })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    changePlan(@CurrentOrganization() org: Organization, @Body() body: ChangePlanRequestDto) {
        return this.billingService.changePlan(org.id, body.priceId);
    }

    // =========================================================================
    //
    // Payment Methods management endpoints
    //
    // =========================================================================

    @Get('payment-methods')
    @ApiPaginationQuery()
    @UseGuards(TenantGuard)
    @ApiOperation({ summary: "List organization's saved payment methods (cards)" })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiResponse({ status: 200, description: 'List of saved payment methods', type: PaymentMethodDto, isArray: true })
    listPaymentMethods(@CurrentOrganization() org: Organization) {
        return this.billingService.listPaymentMethods(org.id);
    }

    @Post('payment-methods/setup-intent')
    @UseGuards(TenantGuard, RolesGuard)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Create a Stripe SetupIntent to add a new card (OWNER/ADMIN only)' })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiResponse({ status: 200, description: 'SetupIntent created  use clientSecret in Stripe.js', type: SetupIntentDto })
    createSetupIntent(@CurrentOrganization() org: Organization) {
        return this.billingService.createSetupIntent(org.id);
    }

    @Post('payment-methods/:paymentMethodId/set-default')
    @UseGuards(TenantGuard, RolesGuard)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Set a card as the default payment method (OWNER/ADMIN only)' })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiResponse({ status: 200, description: 'Default payment method updated' })
    @ApiResponse({ status: 400, description: 'Payment method does not belong to this organization' })
    setDefaultPaymentMethod(@CurrentOrganization() org: Organization, @Param('paymentMethodId') paymentMethodId: string) {
        return this.billingService.setDefaultPaymentMethod(org.id, paymentMethodId);
    }

    @Delete('payment-methods/:paymentMethodId')
    @UseGuards(TenantGuard, RolesGuard)
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Remove a saved payment method (OWNER/ADMIN only)' })
    @ApiHeader({ name: 'x-organization-id', required: true })
    @ApiResponse({ status: 200, description: 'Payment method removed' })
    @ApiResponse({ status: 400, description: 'Payment method does not belong to this organization' })
    detachPaymentMethod(@CurrentOrganization() org: Organization, @Param('paymentMethodId') paymentMethodId: string) {
        return this.billingService.detachPaymentMethod(org.id, paymentMethodId);
    }
}
