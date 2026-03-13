import { ApiProperty } from '@nestjs/swagger';

export class PlanMetadataDto {
    @ApiProperty({ example: 10, description: 'Maximum number of cloud accounts allowed' })
    maxCloudAccounts!: number;

    @ApiProperty({ example: 20, description: 'Maximum number of users allowed' })
    maxUsers!: number;

    @ApiProperty({
        example: ['assessment', 'resources'],
        description: "Modules available in this plan. ['*'] means all modules. [] means no modules.",
    })
    modules!: string[];
}

export class PlanDto {
    @ApiProperty({ example: 'prod_xxx', description: 'Stripe product ID' })
    productId!: string;

    @ApiProperty({ example: 'price_xxx', description: 'Stripe price ID' })
    priceId!: string;

    @ApiProperty({ example: 'Starter Plan' })
    name!: string;

    @ApiProperty({ example: 'Everything you need to get started', nullable: true })
    description!: string | null;

    @ApiProperty({ example: 4900, description: 'Amount in cents' })
    unitAmount!: number;

    @ApiProperty({ example: 'brl', description: 'Currency code' })
    currency!: string;

    @ApiProperty({ example: 'month', enum: ['month', 'year'] })
    interval!: string;

    @ApiProperty({ type: PlanMetadataDto })
    metadata!: PlanMetadataDto;

    @ApiProperty({ example: true })
    active!: boolean;
}

export class SubscriptionDto {
    @ApiProperty({ example: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'uuid' })
    organizationId!: string;

    @ApiProperty({ example: 'cus_xxx' })
    stripeCustomerId!: string;

    @ApiProperty({ example: 'sub_xxx', nullable: true })
    stripeSubscriptionId!: string | null;

    @ApiProperty({ example: 'price_xxx', nullable: true })
    stripePriceId!: string | null;

    @ApiProperty({ example: 'prod_xxx', nullable: true })
    stripeProductId!: string | null;

    @ApiProperty({ example: 'active', enum: ['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'] })
    status!: string;

    @ApiProperty({ nullable: true })
    currentPeriodStart!: Date | null;

    @ApiProperty({ nullable: true })
    currentPeriodEnd!: Date | null;

    @ApiProperty({ example: false })
    cancelAtPeriodEnd!: boolean;

    @ApiProperty({ type: PlanDto, nullable: true })
    plan!: PlanDto | null;
}

export class PaymentMethodCardDto {
    @ApiProperty({ example: 'visa' })
    brand!: string;

    @ApiProperty({ example: '4242' })
    last4!: string;

    @ApiProperty({ example: 12 })
    expMonth!: number;

    @ApiProperty({ example: 2028 })
    expYear!: number;
}

export class PaymentMethodDto {
    @ApiProperty({ example: 'pm_xxx' })
    id!: string;

    @ApiProperty({ type: PaymentMethodCardDto })
    card!: PaymentMethodCardDto;

    @ApiProperty({ example: true, description: 'Whether this is the default payment method' })
    isDefault!: boolean;
}

export class SetupIntentDto {
    @ApiProperty({ example: 'seti_xxx' })
    setupIntentId!: string;

    @ApiProperty({ description: 'Client secret used by Stripe.js on the frontend' })
    clientSecret!: string;
}

export class ChangePlanRequestDto {
    @ApiProperty({ example: 'price_xxx', description: 'Stripe price ID of the new plan' })
    priceId!: string;
}

export class ChangePlanCheckoutSessionDto {
    @ApiProperty({ example: 'cs_test_xxx', description: 'Stripe Checkout Session ID' })
    checkoutSessionId!: string;

    @ApiProperty({ example: 'https://checkout.stripe.com/c/pay/cs_test_xxx', description: 'Hosted Checkout URL to complete plan change payment' })
    checkoutUrl!: string;
}

export class SetDefaultPaymentMethodRequestDto {
    @ApiProperty({ example: 'pm_xxx', description: 'Stripe payment method ID to set as default' })
    paymentMethodId!: string;
}
