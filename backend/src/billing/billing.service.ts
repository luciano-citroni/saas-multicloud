import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    InternalServerErrorException,
    ForbiddenException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { InjectRepository } from '@nestjs/typeorm';

import { QueryFailedError, Repository } from 'typeorm';

import Stripe from 'stripe';

import { OrganizationSubscription, TenantSubscriptionStatus } from '../db/entites/organization-subscription.entity';

import { UserSubscription, SubscriptionStatus } from '../db/entites/user-subscription.entity';

import { User } from '../db/entites/user.entity';

import { Tenant } from '../db/entites/tenant.entity';

import { TenantMember } from '../db/entites/tenant-member.entity';

import { OrgRole } from '../rbac/roles.enum';

import { ErrorMessages } from '../common/messages/error-messages';

import { ALL_MODULES_TOKEN, isKnownSystemModule, normalizeModuleName, normalizePlanModules, parseModulesMetadata } from '../common/modules/system-modules';

export interface PlanMetadata {
    maxCloudAccounts: number;

    maxOrgAccounts: number;

    maxUsers: number;

    modules: string[];
}

export interface PlanInfo {
    productId: string;

    priceId: string;

    name: string;

    description: string | null;

    unitAmount: number;

    currency: string;

    interval: string;

    metadata: PlanMetadata;

    active: boolean;
}

export interface ChangePlanCheckoutSession {
    checkoutSessionId: string;

    checkoutUrl: string;
}

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    private readonly stripe: Stripe;

    constructor(
        @InjectRepository(OrganizationSubscription)
        private readonly tenantSubRepository: Repository<OrganizationSubscription>,

        @InjectRepository(UserSubscription)
        private readonly userSubRepository: Repository<UserSubscription>,

        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @InjectRepository(TenantMember)
        private readonly memberRepository: Repository<TenantMember>,

        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,

        private readonly configService: ConfigService
    ) {
        const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY environment variable is not set');
        }

        this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
    }

    // ─── Plans ────────────────────────────────────────────────────────────────

    async listPlans(): Promise<PlanInfo[]> {
        const prices = await this.stripe.prices.list({
            active: true,

            type: 'recurring',

            expand: ['data.product'],

            limit: 100,
        });

        const plans = prices.data
            .filter((price) => {
                const product = price.product as Stripe.Product;

                return product.active;
            })
            .map((price) => {
                const product = price.product as Stripe.Product;

                return {
                    productId: product.id,

                    priceId: price.id,

                    name: product.name,

                    description: product.description,

                    unitAmount: price.unit_amount ?? 0,

                    currency: price.currency,

                    interval: price.recurring?.interval ?? 'month',

                    metadata: this.parsePlanMetadata(price.metadata, product.metadata),

                    active: product.active,
                };
            });

        const defaultProductId = this.configService.get<string>('DEFAULT_STRIPE_PRODUCT_ID') ?? null;

        if (!defaultProductId) {
            return plans;
        }

        return plans.filter((plan) => plan.productId !== defaultProductId);
    }

    async getPlanByPriceId(priceId: string): Promise<PlanInfo | null> {
        try {
            const price = await this.stripe.prices.retrieve(priceId, {
                expand: ['product'],
            });

            const product = price.product as Stripe.Product;

            return {
                productId: product.id,

                priceId: price.id,

                name: product.name,

                description: product.description,

                unitAmount: price.unit_amount ?? 0,

                currency: price.currency,

                interval: price.recurring?.interval ?? 'month',

                metadata: this.parsePlanMetadata(price.metadata, product.metadata),

                active: product.active,
            };
        } catch {
            return null;
        }
    }

    // ─── Tenant Subscription ──────────────────────────────────────────────────

    /**
     * Creates a Stripe customer + default subscription for a newly created tenant.
     * Called fire-and-forget from OrganizationService.create().
     */
    async initializeTenantSubscription(tenant: Tenant): Promise<OrganizationSubscription> {
        const existing = await this.tenantSubRepository.findOne({ where: { tenantId: tenant.id } });

        if (existing) {
            return existing;
        }

        const defaultProductId = this.configService.get<string>('DEFAULT_STRIPE_PRODUCT_ID');

        if (!defaultProductId) {
            throw new InternalServerErrorException('DEFAULT_STRIPE_PRODUCT_ID is not configured');
        }

        let customerId: string | null = null;

        let subscriptionId: string | null = null;

        try {
            const priceId = await this.resolveDefaultPriceFromProduct(defaultProductId);

            const customer = await this.stripe.customers.create({
                name: tenant.name,

                metadata: { tenantId: tenant.id },
            });

            customerId = customer.id;

            const subscription = await this.stripe.subscriptions.create({
                customer: customer.id,

                items: [{ price: priceId }],

                payment_behavior: 'default_incomplete',

                payment_settings: { save_default_payment_method: 'on_subscription' },

                metadata: { tenantId: tenant.id },
            });

            subscriptionId = subscription.id;

            const record = this.tenantSubRepository.create({
                tenantId: tenant.id,

                stripeCustomerId: customer.id,

                stripeSubscriptionId: subscription.id,

                stripePriceId: priceId,

                stripeProductId: defaultProductId,

                status: subscription.status,

                currentPeriodEnd: new Date(subscription.billing_cycle_anchor * 1000),

                currentPeriodStart: new Date(subscription.start_date * 1000),

                cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });

            return await this.tenantSubRepository.save(record);
        } catch (error) {
            await this.rollbackStripeResources(customerId, subscriptionId);

            throw error;
        }
    }

    async getTenantSubscription(tenantId: string, checkoutSessionId?: string): Promise<OrganizationSubscription & { plan: PlanInfo | null }> {
        if (checkoutSessionId) {
            await this.reconcileTenantCheckoutSession(tenantId, checkoutSessionId);
        }

        const record = await this.getOrInitializeTenantSubscriptionRecord(tenantId);

        let plan: PlanInfo | null = null;

        if (record.stripePriceId) {
            plan = await this.getPlanByPriceId(record.stripePriceId);

            if (plan) {
                await this.syncTenantPlanSnapshot(tenantId, plan);
            }
        }

        return { ...record, plan };
    }

    async changeTenantPlan(tenantId: string, newPriceId: string): Promise<ChangePlanCheckoutSession> {
        const record = await this.getOrInitializeTenantSubscriptionRecord(tenantId);

        if (!record.stripeSubscriptionId || !record.stripeCustomerId) {
            throw new BadRequestException('Tenant não possui assinatura ativa para alterar');
        }

        if (record.stripePriceId === newPriceId) {
            throw new BadRequestException('Tenant já está neste plano');
        }

        const targetPlan = await this.getPlanByPriceId(newPriceId);

        if (!targetPlan || !targetPlan.active) {
            throw new BadRequestException('Plano selecionado não está disponível');
        }

        const defaultProductId = this.configService.get<string>('DEFAULT_STRIPE_PRODUCT_ID') ?? null;

        if (defaultProductId && record.stripeProductId && record.stripeProductId !== defaultProductId && targetPlan.productId === defaultProductId) {
            throw new BadRequestException('Retornar ao plano padrão não é permitido');
        }

        const frontendUrl = this.configService.get<string>('FRONTEND_URL');

        if (!frontendUrl) {
            throw new InternalServerErrorException('FRONTEND_URL não configurada');
        }

        const successUrl = `${frontendUrl.replace(/\/$/, '')}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;

        const cancelUrl = `${frontendUrl.replace(/\/$/, '')}/billing?checkout=cancel`;

        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',

            customer: record.stripeCustomerId,

            line_items: [{ price: newPriceId, quantity: 1 }],

            success_url: successUrl,

            cancel_url: cancelUrl,

            subscription_data: {
                metadata: {
                    tenantId,

                    replacesSubscriptionId: record.stripeSubscriptionId,
                },
            },

            metadata: {
                tenantId,

                requestedPriceId: newPriceId,

                previousSubscriptionId: record.stripeSubscriptionId,
            },
        });

        if (!session.url) {
            throw new InternalServerErrorException('URL de checkout não gerada pelo Stripe');
        }

        return { checkoutSessionId: session.id, checkoutUrl: session.url };
    }

    /**
     * Resolves the active plan for a tenant.
     * Used by CloudService, AssessmentService, etc. to enforce per-resource limits.
     */
    async getActivePlanForOrganization(tenantId: string): Promise<PlanInfo> {
        const sub = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (!sub) {
            throw new ForbiddenException(ErrorMessages.PLANS.NO_ACTIVE_PLAN);
        }

        if (![TenantSubscriptionStatus.ACTIVE, TenantSubscriptionStatus.TRIALING].includes(sub.status as TenantSubscriptionStatus)) {
            throw new ForbiddenException(ErrorMessages.PLANS.NO_ACTIVE_PLAN);
        }

        if (!sub.stripePriceId) {
            throw new ForbiddenException(ErrorMessages.PLANS.PLAN_METADATA_NOT_AVAILABLE);
        }

        const plan = await this.getPlanByPriceId(sub.stripePriceId);

        if (!plan || !plan.active) {
            throw new ForbiddenException(ErrorMessages.PLANS.PLAN_METADATA_NOT_AVAILABLE);
        }

        await this.syncTenantPlanSnapshot(tenantId, plan);

        return plan;
    }

    async assertModuleEnabled(tenantId: string, moduleName: string): Promise<void> {
        const plan = await this.getActivePlanForOrganization(tenantId);

        const normalizedModule = normalizeModuleName(moduleName);

        const modules = normalizePlanModules(plan.metadata.modules);

        if (!isKnownSystemModule(normalizedModule)) {
            this.logger.warn(`Unknown module "${normalizedModule}" requested in module access assertion`);

            throw new ForbiddenException(ErrorMessages.PLANS.MODULE_NOT_ENABLED);
        }

        if (modules.includes(ALL_MODULES_TOKEN) || modules.includes(normalizedModule)) {
            return;
        }

        throw new ForbiddenException(ErrorMessages.PLANS.MODULE_NOT_ENABLED);
    }

    // ─── Payment Methods (tenant-scoped) ──────────────────────────────────────

    async listTenantPaymentMethods(tenantId: string): Promise<{ id: string; card: Stripe.PaymentMethod.Card; isDefault: boolean }[]> {
        const record = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (!record) {
            throw new NotFoundException('Nenhuma assinatura encontrada para este tenant');
        }

        const [paymentMethods, customer] = await Promise.all([
            this.stripe.paymentMethods.list({ customer: record.stripeCustomerId, type: 'card' }),

            this.stripe.customers.retrieve(record.stripeCustomerId) as Promise<Stripe.Customer>,
        ]);

        const defaultPaymentMethodId =
            typeof customer.invoice_settings?.default_payment_method === 'string'
                ? customer.invoice_settings.default_payment_method
                : (customer.invoice_settings?.default_payment_method?.id ?? null);

        return paymentMethods.data.map((pm) => ({
            id: pm.id,

            card: pm.card!,

            isDefault: pm.id === defaultPaymentMethodId,
        }));
    }

    async createTenantSetupIntent(tenantId: string): Promise<{ setupIntentId: string; clientSecret: string }> {
        const record = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (!record) {
            throw new NotFoundException('Nenhuma assinatura encontrada para este tenant');
        }

        const setupIntent = await this.stripe.setupIntents.create({
            customer: record.stripeCustomerId,

            payment_method_types: ['card'],

            metadata: { tenantId },
        });

        return { setupIntentId: setupIntent.id, clientSecret: setupIntent.client_secret! };
    }

    async setTenantDefaultPaymentMethod(tenantId: string, paymentMethodId: string): Promise<void> {
        const record = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (!record) {
            throw new NotFoundException('Nenhuma assinatura encontrada para este tenant');
        }

        const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);

        if (pm.customer !== record.stripeCustomerId) {
            throw new BadRequestException('Método de pagamento não pertence a este tenant');
        }

        await this.stripe.customers.update(record.stripeCustomerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });

        if (record.stripeSubscriptionId) {
            await this.stripe.subscriptions.update(record.stripeSubscriptionId, {
                default_payment_method: paymentMethodId,
            });
        }
    }

    async detachTenantPaymentMethod(tenantId: string, paymentMethodId: string): Promise<void> {
        const record = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (!record) {
            throw new NotFoundException('Nenhuma assinatura encontrada para este tenant');
        }

        const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);

        if (pm.customer !== record.stripeCustomerId) {
            throw new BadRequestException('Método de pagamento não pertence a este tenant');
        }

        await this.stripe.paymentMethods.detach(paymentMethodId);
    }

    // ─── User Subscription (kept for auth flow / individual users) ────────────

    async initializeSubscription(user: Pick<User, 'id' | 'name' | 'email'>): Promise<UserSubscription> {
        const existing = await this.userSubRepository.findOne({ where: { userId: user.id } });

        if (existing) {
            return existing;
        }

        const defaultProductId = this.configService.get<string>('DEFAULT_STRIPE_PRODUCT_ID');

        if (!defaultProductId) {
            throw new InternalServerErrorException('DEFAULT_STRIPE_PRODUCT_ID is not configured');
        }

        let customerId: string | null = null;

        let subscriptionId: string | null = null;

        try {
            const priceId = await this.resolveDefaultPriceFromProduct(defaultProductId);

            const customer = await this.stripe.customers.create({
                name: user.name,

                email: user.email.toLowerCase(),

                metadata: { userId: user.id },
            });

            customerId = customer.id;

            const subscription = await this.stripe.subscriptions.create({
                customer: customer.id,

                items: [{ price: priceId }],

                payment_behavior: 'default_incomplete',

                payment_settings: { save_default_payment_method: 'on_subscription' },

                metadata: { userId: user.id },
            });

            subscriptionId = subscription.id;

            const record = this.userSubRepository.create({
                userId: user.id,

                stripeCustomerId: customer.id,

                stripeSubscriptionId: subscription.id,

                stripePriceId: priceId,

                stripeProductId: defaultProductId,

                status: subscription.status,

                currentPeriodEnd: new Date(subscription.billing_cycle_anchor * 1000),

                currentPeriodStart: new Date(subscription.start_date * 1000),

                cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });

            return await this.userSubRepository.save(record);
        } catch (error) {
            await this.rollbackStripeResources(customerId, subscriptionId);

            throw error;
        }
    }

    // ─── Webhook ──────────────────────────────────────────────────────────────

    async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

        if (!webhookSecret) {
            throw new InternalServerErrorException('STRIPE_WEBHOOK_SECRET is not configured');
        }

        let event: Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';

            this.logger.warn(`Stripe webhook signature verification failed: ${message}`);

            throw new BadRequestException(`Webhook signature verification failed: ${message}`);
        }

        this.logger.log(`Processing Stripe webhook event: ${event.type}`);

        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);

                break;

            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);

                break;

            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);

                break;

            case 'invoice.payment_failed':
                await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);

                break;

            case 'invoice.payment_succeeded':
                await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);

                break;

            default:
                this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
        }
    }

    // ─── Private webhook handlers ─────────────────────────────────────────────

    private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
        const tenantId = session.metadata?.tenantId;

        if (tenantId) {
            await this.applyCheckoutSessionToTenant(session);
        } else {
            await this.applyCheckoutSessionToUser(session);
        }
    }

    private async reconcileTenantCheckoutSession(tenantId: string, checkoutSessionId: string): Promise<void> {
        const session = await this.stripe.checkout.sessions.retrieve(checkoutSessionId, {
            expand: ['subscription'],
        });

        await this.applyCheckoutSessionToTenant(session, tenantId, true);
    }

    private async applyCheckoutSessionToTenant(
        session: Stripe.Checkout.Session,

        expectedTenantId?: string,

        strictValidation = false
    ): Promise<void> {
        const metadata = session.metadata ?? {};

        const tenantId = metadata.tenantId ?? undefined;

        const previousSubscriptionId = metadata.previousSubscriptionId;

        const checkoutSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (strictValidation && session.status !== 'complete') {
            throw new BadRequestException('Checkout session is not completed yet');
        }

        if (expectedTenantId && tenantId && expectedTenantId !== tenantId) {
            throw new ForbiddenException('Checkout session does not belong to this tenant');
        }

        if (!tenantId || !checkoutSubscriptionId) {
            if (strictValidation) {
                throw new BadRequestException('Checkout session is missing tenantId or subscription');
            }

            this.logger.warn(`Tenant checkout session ${session.id} missing tenantId or subscription`);

            return;
        }

        const record = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (!record) {
            if (strictValidation) {
                throw new NotFoundException('No subscription found for this tenant');
            }

            this.logger.warn(`No subscription record found for tenant ${tenantId}`);

            return;
        }

        const checkoutSubscription = await this.stripe.subscriptions.retrieve(checkoutSubscriptionId);

        const checkoutCustomerId = typeof checkoutSubscription.customer === 'string' ? checkoutSubscription.customer : checkoutSubscription.customer?.id;

        if (checkoutCustomerId && checkoutCustomerId !== record.stripeCustomerId) {
            throw new ForbiddenException('Checkout session customer does not match tenant subscription');
        }

        const subscriptionToReplace = previousSubscriptionId ?? record.stripeSubscriptionId;

        if (subscriptionToReplace && subscriptionToReplace !== checkoutSubscription.id) {
            await this.cancelSubscriptionStrict(subscriptionToReplace, record.stripeCustomerId, 'previous tenant checkout subscription');
        }

        await this.cancelOtherCustomerSubscriptionsStrict(record.stripeCustomerId, checkoutSubscription.id);

        const priceId = checkoutSubscription.items.data[0]?.price?.id ?? null;

        const productId = this.extractProductId(checkoutSubscription.items.data[0]?.price?.product);

        record.stripeSubscriptionId = checkoutSubscription.id;

        record.stripePriceId = priceId;

        record.stripeProductId = productId;

        record.status = checkoutSubscription.status;

        record.currentPeriodEnd = new Date(checkoutSubscription.billing_cycle_anchor * 1000);

        record.currentPeriodStart = new Date(checkoutSubscription.start_date * 1000);

        record.cancelAtPeriodEnd = checkoutSubscription.cancel_at_period_end;

        await this.tenantSubRepository.save(record);

        if (priceId) {
            const plan = await this.getPlanByPriceId(priceId);
            if (plan) {
                await this.syncTenantPlanSnapshot(tenantId, plan);
            }
        }

        this.logger.log(`Checkout completed for tenant ${tenantId}; subscription switched to ${checkoutSubscription.id}`);
    }

    private async applyCheckoutSessionToUser(
        session: Stripe.Checkout.Session,

        expectedUserId?: string,

        strictValidation = false
    ): Promise<void> {
        const metadata = session.metadata ?? {};

        const userId = metadata.userId ?? session.client_reference_id ?? undefined;

        const previousSubscriptionId = metadata.previousSubscriptionId;

        const checkoutSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (strictValidation && session.status !== 'complete') {
            throw new BadRequestException('Checkout session is not completed yet');
        }

        if (expectedUserId && userId && expectedUserId !== userId) {
            throw new ForbiddenException('Checkout session does not belong to this user');
        }

        if (!userId || !checkoutSubscriptionId) {
            if (strictValidation) {
                throw new BadRequestException('Checkout session is missing userId or subscription');
            }

            this.logger.warn(`User checkout session ${session.id} missing userId or subscription`);

            return;
        }

        const record = await this.userSubRepository.findOne({ where: { userId } });

        if (!record) {
            if (strictValidation) {
                throw new NotFoundException('No subscription found for this user');
            }

            this.logger.warn(`No subscription record found for user ${userId}`);

            return;
        }

        const checkoutSubscription = await this.stripe.subscriptions.retrieve(checkoutSubscriptionId);

        const checkoutCustomerId = typeof checkoutSubscription.customer === 'string' ? checkoutSubscription.customer : checkoutSubscription.customer?.id;

        if (checkoutCustomerId && checkoutCustomerId !== record.stripeCustomerId) {
            throw new ForbiddenException('Checkout session customer does not match user subscription');
        }

        const subscriptionToReplace = previousSubscriptionId ?? record.stripeSubscriptionId;

        if (subscriptionToReplace && subscriptionToReplace !== checkoutSubscription.id) {
            await this.cancelSubscriptionStrict(subscriptionToReplace, record.stripeCustomerId, 'previous user checkout subscription');
        }

        await this.cancelOtherCustomerSubscriptionsStrict(record.stripeCustomerId, checkoutSubscription.id);

        const priceId = checkoutSubscription.items.data[0]?.price?.id ?? null;

        const productId = this.extractProductId(checkoutSubscription.items.data[0]?.price?.product);

        record.stripeSubscriptionId = checkoutSubscription.id;

        record.stripePriceId = priceId;

        record.stripeProductId = productId;

        record.status = checkoutSubscription.status;

        record.currentPeriodEnd = new Date(checkoutSubscription.billing_cycle_anchor * 1000);

        record.currentPeriodStart = new Date(checkoutSubscription.start_date * 1000);

        record.cancelAtPeriodEnd = checkoutSubscription.cancel_at_period_end;

        await this.userSubRepository.save(record);

        this.logger.log(`Checkout completed for user ${userId}; subscription switched to ${checkoutSubscription.id}`);
    }

    private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
        const tenantId = subscription.metadata?.tenantId;

        const priceId = subscription.items.data[0]?.price?.id ?? null;

        const productId = this.extractProductId(subscription.items.data[0]?.price?.product);

        if (tenantId) {
            const record = await this.tenantSubRepository.findOne({ where: { stripeSubscriptionId: subscription.id } });

            if (!record) {
                this.logger.warn(`No tenant subscription record found for Stripe subscription ${subscription.id}`);

                return;
            }

            record.status = subscription.status;

            record.stripePriceId = priceId;

            record.stripeProductId = productId;

            record.currentPeriodEnd = new Date(subscription.billing_cycle_anchor * 1000);

            record.currentPeriodStart = new Date(subscription.start_date * 1000);

            record.cancelAtPeriodEnd = subscription.cancel_at_period_end;

            await this.tenantSubRepository.save(record);

            if (priceId) {
                const plan = await this.getPlanByPriceId(priceId);
                if (plan) {
                    await this.syncTenantPlanSnapshot(record.tenantId, plan);
                }
            }

            this.logger.log(`Updated tenant subscription ${record.id} to status: ${subscription.status}`);
        } else {
            const record = await this.userSubRepository.findOne({ where: { stripeSubscriptionId: subscription.id } });

            if (!record) {
                this.logger.warn(`No user subscription record found for Stripe subscription ${subscription.id}`);

                return;
            }

            record.status = subscription.status;

            record.stripePriceId = priceId;

            record.stripeProductId = productId;

            record.currentPeriodEnd = new Date(subscription.billing_cycle_anchor * 1000);

            record.currentPeriodStart = new Date(subscription.start_date * 1000);

            record.cancelAtPeriodEnd = subscription.cancel_at_period_end;

            await this.userSubRepository.save(record);

            this.logger.log(`Updated user subscription ${record.id} to status: ${subscription.status}`);
        }
    }

    private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
        const tenantRecord = await this.tenantSubRepository.findOne({ where: { stripeSubscriptionId: subscription.id } });

        if (tenantRecord) {
            tenantRecord.status = TenantSubscriptionStatus.CANCELED;

            tenantRecord.cancelAtPeriodEnd = false;

            await this.tenantSubRepository.save(tenantRecord);

            this.logger.log(`Tenant subscription ${tenantRecord.id} marked as canceled`);

            return;
        }

        const userRecord = await this.userSubRepository.findOne({ where: { stripeSubscriptionId: subscription.id } });

        if (!userRecord) return;

        userRecord.status = SubscriptionStatus.CANCELED;

        userRecord.cancelAtPeriodEnd = false;

        await this.userSubRepository.save(userRecord);

        this.logger.log(`User subscription ${userRecord.id} marked as canceled`);
    }

    private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
        const subscriptionId = this.extractSubscriptionId(invoice);

        if (!subscriptionId) return;

        const tenantRecord = await this.tenantSubRepository.findOne({ where: { stripeSubscriptionId: subscriptionId } });

        if (tenantRecord) {
            tenantRecord.status = TenantSubscriptionStatus.PAST_DUE;

            await this.tenantSubRepository.save(tenantRecord);

            this.logger.warn(`Payment failed for tenant subscription ${tenantRecord.id} — marked as past_due`);

            return;
        }

        const userRecord = await this.userSubRepository.findOne({ where: { stripeSubscriptionId: subscriptionId } });

        if (!userRecord) return;

        userRecord.status = SubscriptionStatus.PAST_DUE;

        await this.userSubRepository.save(userRecord);

        this.logger.warn(`Payment failed for user subscription ${userRecord.id} — marked as past_due`);
    }

    private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
        const subscriptionId = this.extractSubscriptionId(invoice);

        if (!subscriptionId) return;

        const tenantRecord = await this.tenantSubRepository.findOne({ where: { stripeSubscriptionId: subscriptionId } });

        if (tenantRecord) {
            if (tenantRecord.status !== TenantSubscriptionStatus.ACTIVE) {
                tenantRecord.status = TenantSubscriptionStatus.ACTIVE;

                await this.tenantSubRepository.save(tenantRecord);

                this.logger.log(`Payment succeeded for tenant subscription ${tenantRecord.id} — marked as active`);
            }

            return;
        }

        const userRecord = await this.userSubRepository.findOne({ where: { stripeSubscriptionId: subscriptionId } });

        if (!userRecord || userRecord.status === SubscriptionStatus.ACTIVE) return;

        userRecord.status = SubscriptionStatus.ACTIVE;

        await this.userSubRepository.save(userRecord);

        this.logger.log(`Payment succeeded for user subscription ${userRecord.id} — marked as active`);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private async resolveOrgOwnerId(tenantId: string): Promise<string | null> {
        const ownerMembership = await this.memberRepository.findOne({
            where: { tenantId, role: OrgRole.OWNER },
        });

        return ownerMembership?.userId ?? null;
    }

    private extractSubscriptionId(invoice: Stripe.Invoice): string | null {
        const details = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent
            ?.subscription_details?.subscription;

        if (!details) return null;

        return typeof details === 'string' ? details : details.id;
    }

    private async resolveDefaultPriceFromProduct(productId: string): Promise<string> {
        const product = await this.stripe.products.retrieve(productId, { expand: ['default_price'] });

        if (product.default_price) {
            const defaultPrice = product.default_price as Stripe.Price;

            if (defaultPrice.type === 'recurring') {
                return defaultPrice.id;
            }
        }

        const prices = await this.stripe.prices.list({ product: productId, active: true, type: 'recurring', limit: 1 });

        if (!prices.data[0]) {
            throw new InternalServerErrorException(
                `No active recurring price found for product ${productId}. Set a default_price on the product or create a recurring price.`
            );
        }

        return prices.data[0].id;
    }

    private async rollbackStripeResources(customerId: string | null, subscriptionId: string | null): Promise<void> {
        if (subscriptionId) {
            try {
                await this.stripe.subscriptions.cancel(subscriptionId);
            } catch (error) {
                this.logger.warn(`Failed to rollback Stripe subscription ${subscriptionId}: ${this.stringifyError(error)}`);
            }
        }

        if (customerId) {
            try {
                await this.stripe.customers.del(customerId);
            } catch (error) {
                this.logger.warn(`Failed to rollback Stripe customer ${customerId}: ${this.stringifyError(error)}`);
            }
        }
    }

    private async cancelSubscriptionStrict(subscriptionId: string, customerId: string, reason: string): Promise<void> {
        try {
            await this.stripe.subscriptions.cancel(subscriptionId, { prorate: false });

            this.logger.log(`Canceled ${reason} ${subscriptionId} for customer ${customerId}`);
        } catch (error) {
            const message = this.stringifyError(error);

            this.logger.error(`Failed to cancel ${reason} ${subscriptionId} for customer ${customerId}: ${message}`);

            throw new InternalServerErrorException(`Failed to cancel existing subscription ${subscriptionId}`);
        }
    }

    private async cancelOtherCustomerSubscriptionsStrict(customerId: string, keepSubscriptionId: string): Promise<void> {
        const subscriptions = await this.stripe.subscriptions.list({
            customer: customerId,

            status: 'all',

            limit: 100,
        });

        for (const subscription of subscriptions.data) {
            if (subscription.id === keepSubscriptionId) {
                continue;
            }

            if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
                continue;
            }

            await this.cancelSubscriptionStrict(subscription.id, customerId, 'legacy subscription');
        }
    }

    private stringifyError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    private extractProductId(product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined): string | null {
        if (!product) return null;

        return typeof product === 'string' ? product : product.id;
    }

    private async syncTenantPlanSnapshot(tenantId: string, plan: PlanInfo): Promise<void> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });

        if (!tenant) {
            return;
        }

        const normalizedModules = normalizePlanModules(plan.metadata.modules);
        const maxCloudAccounts = Number.isFinite(plan.metadata.maxCloudAccounts) ? plan.metadata.maxCloudAccounts : 0;
        const maxUsers = Number.isFinite(plan.metadata.maxUsers) ? plan.metadata.maxUsers : 0;

        const currentModules = normalizePlanModules(tenant.plans ?? []);
        const modulesChanged = JSON.stringify(currentModules) !== JSON.stringify(normalizedModules);
        const limitsChanged = tenant.maxCloudAccounts !== maxCloudAccounts || tenant.maxUsers !== maxUsers;

        if (!modulesChanged && !limitsChanged) {
            return;
        }

        tenant.plans = normalizedModules;
        tenant.maxCloudAccounts = maxCloudAccounts;
        tenant.maxUsers = maxUsers;

        await this.tenantRepository.save(tenant);
    }

    private async getOrInitializeTenantSubscriptionRecord(tenantId: string): Promise<OrganizationSubscription> {
        const existing = await this.tenantSubRepository.findOne({ where: { tenantId } });

        if (existing) {
            return existing;
        }

        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });

        if (!tenant) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        try {
            return await this.initializeTenantSubscription(tenant);
        } catch (error) {
            const dbCode = error instanceof QueryFailedError ? ((error as QueryFailedError & { code?: string }).code ?? undefined) : undefined;

            // GET /billing/subscription can race with another initialization path.
            // If another request created the row first, return the now-existing record.
            if (dbCode === '23505') {
                const concurrentRecord = await this.tenantSubRepository.findOne({ where: { tenantId } });

                if (concurrentRecord) {
                    return concurrentRecord;
                }
            }

            throw error;
        }
    }

    private parseProductMetadata(metadata: Stripe.Metadata): PlanMetadata {
        const { modules, unknownModules } = parseModulesMetadata(metadata['modules'] ?? '');

        if (unknownModules.length > 0) {
            this.logger.warn(`Ignoring unknown Stripe plan modules: ${unknownModules.join(', ')}`);
        }

        return {
            maxCloudAccounts: parseInt(metadata['max_cloud_accounts'] ?? '0', 10),

            maxOrgAccounts: parseInt(metadata['max_org_accounts'] ?? '0', 10),

            maxUsers: parseInt(metadata['max_users'] ?? '0', 10),

            modules,
        };
    }

    private parsePlanMetadata(priceMetadata: Stripe.Metadata, productMetadata: Stripe.Metadata): PlanMetadata {
        return this.parseProductMetadata({
            ...productMetadata,
            ...priceMetadata,
        });
    }
}
