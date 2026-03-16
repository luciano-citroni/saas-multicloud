import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { OrganizationSubscription, SubscriptionStatus } from '../db/entites/organization-subscription.entity';
import { Organization } from '../db/entites/organization.entity';
import { User } from '../db/entites/user.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import { ALL_MODULES_TOKEN, isKnownSystemModule, normalizeModuleName, normalizePlanModules, parseModulesMetadata } from '../common/modules/system-modules';

export interface PlanMetadata {
    maxCloudAccounts: number;
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
        private readonly subscriptionRepository: Repository<OrganizationSubscription>,
        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>,
        private readonly configService: ConfigService
    ) {
        const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY environment variable is not set');
        }
        this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
    }

    // ─── Plans ────────────────────────────────────────────────────────────────

    async listPlans(_organizationId?: string): Promise<PlanInfo[]> {
        const prices = await this.stripe.prices.list({
            active: true,
            type: 'recurring',
            expand: ['data.product'],
            limit: 100,
        });

        let plans = prices.data
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
                    metadata: this.parseProductMetadata(product.metadata),
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
                metadata: this.parseProductMetadata(product.metadata),
                active: product.active,
            };
        } catch {
            return null;
        }
    }

    // ─── Subscription ─────────────────────────────────────────────────────────

    /**
     * Creates a Stripe customer + default subscription for a new organization.
     * Called automatically when an organization is created.
     * Customer name = owner.name; company (metadata) = org.name; email = owner.email.
     */
    async initializeSubscription(org: Organization, owner: User): Promise<OrganizationSubscription> {
        const existingSubscription = await this.subscriptionRepository.findOne({ where: { organizationId: org.id } });
        if (existingSubscription) {
            return existingSubscription;
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
                name: owner.name,
                email: owner.email.toLowerCase(),
                description: `Organization: ${org.name}`,
                metadata: {
                    organizationId: org.id,
                    ownerId: owner.id,
                    company: org.name,
                },
            });
            customerId = customer.id;

            const subscription = await this.stripe.subscriptions.create({
                customer: customer.id,
                items: [{ price: priceId }],
                payment_behavior: 'default_incomplete',
                payment_settings: { save_default_payment_method: 'on_subscription' },
                metadata: {
                    organizationId: org.id,
                },
            });
            subscriptionId = subscription.id;

            const record = this.subscriptionRepository.create({
                organizationId: org.id,
                stripeCustomerId: customer.id,
                stripeSubscriptionId: subscription.id,
                stripePriceId: priceId,
                stripeProductId: defaultProductId,
                status: subscription.status,
                currentPeriodEnd: new Date(subscription.billing_cycle_anchor * 1000),
                currentPeriodStart: new Date(subscription.start_date * 1000),
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });

            const savedRecord = await this.subscriptionRepository.save(record);

            const defaultPlan = await this.getPlanByPriceId(priceId);
            if (defaultPlan) {
                await this.syncOrganizationPlanSnapshot(org.id, defaultPlan.metadata);
            }

            return savedRecord;
        } catch (error) {
            await this.rollbackStripeResources(customerId, subscriptionId);
            throw error;
        }
    }

    async getSubscription(organizationId: string, checkoutSessionId?: string): Promise<OrganizationSubscription & { plan: PlanInfo | null }> {
        if (checkoutSessionId) {
            await this.reconcileCheckoutSession(organizationId, checkoutSessionId);
        }

        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new NotFoundException('No subscription found for this organization');
        }

        let plan: PlanInfo | null = null;
        if (record.stripePriceId) {
            plan = await this.getPlanByPriceId(record.stripePriceId);
            if (plan) {
                await this.syncOrganizationPlanSnapshot(organizationId, plan.metadata);
            }
        }

        return { ...record, plan };
    }

    async getActivePlanForOrganization(organizationId: string): Promise<PlanInfo> {
        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new ForbiddenException(ErrorMessages.PLANS.NO_ACTIVE_PLAN);
        }

        if (![SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING].includes(record.status as SubscriptionStatus)) {
            throw new ForbiddenException(ErrorMessages.PLANS.NO_ACTIVE_PLAN);
        }

        if (!record.stripePriceId) {
            throw new ForbiddenException(ErrorMessages.PLANS.PLAN_METADATA_NOT_AVAILABLE);
        }

        const plan = await this.getPlanByPriceId(record.stripePriceId);
        if (!plan || !plan.active) {
            throw new ForbiddenException(ErrorMessages.PLANS.PLAN_METADATA_NOT_AVAILABLE);
        }

        return plan;
    }

    async assertModuleEnabled(organizationId: string, moduleName: string): Promise<void> {
        const plan = await this.getActivePlanForOrganization(organizationId);
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

    async changePlan(organizationId: string, newPriceId: string): Promise<ChangePlanCheckoutSession> {
        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new NotFoundException('No subscription found for this organization');
        }

        if (!record.stripeSubscriptionId || !record.stripeCustomerId) {
            throw new BadRequestException('Organization does not have an active subscription to change');
        }

        if (record.stripePriceId === newPriceId) {
            throw new BadRequestException('Organization is already on this plan');
        }

        const targetPlan = await this.getPlanByPriceId(newPriceId);
        if (!targetPlan || !targetPlan.active) {
            throw new BadRequestException('Selected plan is not available');
        }

        const defaultProductId = this.configService.get<string>('DEFAULT_STRIPE_PRODUCT_ID') ?? null;
        const currentProductId = await this.resolveCurrentProductId(record);
        if (defaultProductId && currentProductId && currentProductId !== defaultProductId && targetPlan.productId === defaultProductId) {
            throw new BadRequestException('Returning to the default plan is not allowed for this organization');
        }

        const frontendUrl = this.configService.get<string>('FRONTEND_URL');
        if (!frontendUrl) {
            throw new InternalServerErrorException('FRONTEND_URL is not configured');
        }

        const successUrl = `${frontendUrl.replace(/\/$/, '')}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${frontendUrl.replace(/\/$/, '')}/billing?checkout=cancel`;

        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: record.stripeCustomerId,
            line_items: [{ price: newPriceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: organizationId,
            subscription_data: {
                metadata: {
                    organizationId,
                    replacesSubscriptionId: record.stripeSubscriptionId,
                },
            },
            metadata: {
                organizationId,
                requestedPriceId: newPriceId,
                previousSubscriptionId: record.stripeSubscriptionId,
            },
        });

        if (!session.url) {
            throw new InternalServerErrorException('Stripe Checkout URL was not generated');
        }

        return {
            checkoutSessionId: session.id,
            checkoutUrl: session.url,
        };
    }

    // ─── Payment Methods ──────────────────────────────────────────────────────

    async listPaymentMethods(organizationId: string): Promise<{ id: string; card: Stripe.PaymentMethod.Card; isDefault: boolean }[]> {
        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new NotFoundException('No subscription found for this organization');
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

    async createSetupIntent(organizationId: string): Promise<{ setupIntentId: string; clientSecret: string }> {
        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new NotFoundException('No subscription found for this organization');
        }

        const setupIntent = await this.stripe.setupIntents.create({
            customer: record.stripeCustomerId,
            payment_method_types: ['card'],
            metadata: { organizationId },
        });

        return {
            setupIntentId: setupIntent.id,
            clientSecret: setupIntent.client_secret!,
        };
    }

    async detachPaymentMethod(organizationId: string, paymentMethodId: string): Promise<void> {
        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new NotFoundException('No subscription found for this organization');
        }

        // Verify the payment method belongs to this customer before detaching
        const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== record.stripeCustomerId) {
            throw new BadRequestException('Payment method does not belong to this organization');
        }

        await this.stripe.paymentMethods.detach(paymentMethodId);
    }

    async setDefaultPaymentMethod(organizationId: string, paymentMethodId: string): Promise<void> {
        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            throw new NotFoundException('No subscription found for this organization');
        }

        // Verify the payment method belongs to this customer
        const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== record.stripeCustomerId) {
            throw new BadRequestException('Payment method does not belong to this organization');
        }

        // Set as default on the customer and on the active subscription
        await this.stripe.customers.update(record.stripeCustomerId, {
            invoice_settings: { default_payment_method: paymentMethodId },
        });

        if (record.stripeSubscriptionId) {
            await this.stripe.subscriptions.update(record.stripeSubscriptionId, {
                default_payment_method: paymentMethodId,
            });
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
        await this.applyCheckoutSessionToOrganization(session);
    }

    private async reconcileCheckoutSession(organizationId: string, checkoutSessionId: string): Promise<void> {
        const session = await this.stripe.checkout.sessions.retrieve(checkoutSessionId, {
            expand: ['subscription'],
        });

        await this.applyCheckoutSessionToOrganization(session, organizationId, true);
    }

    private async applyCheckoutSessionToOrganization(
        session: Stripe.Checkout.Session,
        expectedOrganizationId?: string,
        strictValidation = false
    ): Promise<void> {
        const metadata = session.metadata ?? {};
        const organizationId = metadata.organizationId ?? session.client_reference_id ?? undefined;
        const previousSubscriptionId = metadata.previousSubscriptionId;
        const checkoutSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (strictValidation && session.status !== 'complete') {
            throw new BadRequestException('Checkout session is not completed yet');
        }

        if (expectedOrganizationId && organizationId && expectedOrganizationId !== organizationId) {
            throw new ForbiddenException('Checkout session does not belong to this organization');
        }

        if (!organizationId || !checkoutSubscriptionId) {
            if (strictValidation) {
                throw new BadRequestException('Checkout session is missing organizationId or subscription');
            }

            this.logger.warn(`Checkout session ${session.id} missing organizationId or subscription`);
            return;
        }

        const record = await this.subscriptionRepository.findOne({ where: { organizationId } });
        if (!record) {
            if (strictValidation) {
                throw new NotFoundException('No subscription found for this organization');
            }

            this.logger.warn(`No subscription record found for organization ${organizationId}`);
            return;
        }

        const checkoutSubscription = await this.stripe.subscriptions.retrieve(checkoutSubscriptionId);

        const checkoutCustomerId = typeof checkoutSubscription.customer === 'string' ? checkoutSubscription.customer : checkoutSubscription.customer?.id;
        if (checkoutCustomerId && checkoutCustomerId !== record.stripeCustomerId) {
            throw new ForbiddenException('Checkout session customer does not match organization subscription');
        }

        // Enforce subscription replacement order: cancel old subscriptions first,
        // then persist the new one as the single source of truth in our DB.
        const subscriptionToReplace = previousSubscriptionId ?? record.stripeSubscriptionId;
        if (subscriptionToReplace && subscriptionToReplace !== checkoutSubscription.id) {
            await this.cancelSubscriptionStrict(subscriptionToReplace, record.stripeCustomerId, 'previous checkout subscription');
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

        await this.subscriptionRepository.save(record);
        if (priceId) {
            const selectedPlan = await this.getPlanByPriceId(priceId);
            if (selectedPlan) {
                await this.syncOrganizationPlanSnapshot(organizationId, selectedPlan.metadata);
            }
        }

        this.logger.log(`Checkout completed for organization ${organizationId}; subscription switched to ${checkoutSubscription.id}`);
    }

    private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
        const record = await this.subscriptionRepository.findOne({
            where: { stripeSubscriptionId: subscription.id },
        });
        if (!record) {
            this.logger.warn(`No subscription record found for Stripe subscription ${subscription.id}`);
            return;
        }

        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const productId = this.extractProductId(subscription.items.data[0]?.price?.product);

        record.status = subscription.status;
        record.stripePriceId = priceId;
        record.stripeProductId = productId;
        record.currentPeriodEnd = new Date(subscription.billing_cycle_anchor * 1000);
        record.currentPeriodStart = new Date(subscription.start_date * 1000);
        record.cancelAtPeriodEnd = subscription.cancel_at_period_end;

        await this.subscriptionRepository.save(record);
        if (priceId) {
            const selectedPlan = await this.getPlanByPriceId(priceId);
            if (selectedPlan) {
                await this.syncOrganizationPlanSnapshot(record.organizationId, selectedPlan.metadata);
            }
        }

        this.logger.log(`Updated subscription ${record.id} to status: ${subscription.status}`);
    }

    private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
        const record = await this.subscriptionRepository.findOne({
            where: { stripeSubscriptionId: subscription.id },
        });
        if (!record) return;

        record.status = SubscriptionStatus.CANCELED;
        record.cancelAtPeriodEnd = false;

        await this.subscriptionRepository.save(record);
        await this.syncOrganizationPlanSnapshot(record.organizationId, {
            maxCloudAccounts: 0,
            maxUsers: 0,
            modules: [],
        });

        this.logger.log(`Subscription ${record.id} marked as canceled`);
    }

    private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
        const subscriptionId = this.extractSubscriptionId(invoice);
        if (!subscriptionId) return;

        const record = await this.subscriptionRepository.findOne({
            where: { stripeSubscriptionId: subscriptionId },
        });
        if (!record) return;

        record.status = SubscriptionStatus.PAST_DUE;
        await this.subscriptionRepository.save(record);
        this.logger.warn(`Payment failed for subscription ${record.id} — marked as past_due`);
    }

    private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
        const subscriptionId = this.extractSubscriptionId(invoice);
        if (!subscriptionId) return;

        const record = await this.subscriptionRepository.findOne({
            where: { stripeSubscriptionId: subscriptionId },
        });
        if (!record || record.status === SubscriptionStatus.ACTIVE) return;

        record.status = SubscriptionStatus.ACTIVE;
        await this.subscriptionRepository.save(record);
        this.logger.log(`Payment succeeded for subscription ${record.id} — marked as active`);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Extracts the subscription ID from an Invoice object.
     * In Stripe API 2026-02-25.clover, subscription info is nested under parent.subscription_details.
     */
    private extractSubscriptionId(invoice: Stripe.Invoice): string | null {
        const details = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent
            ?.subscription_details?.subscription;
        if (!details) return null;
        return typeof details === 'string' ? details : details.id;
    }

    /**
     * Resolves the default recurring price ID from a Stripe product.
     * Uses product.default_price if set; falls back to the first active recurring price.
     */
    private async resolveDefaultPriceFromProduct(productId: string): Promise<string> {
        const product = await this.stripe.products.retrieve(productId, { expand: ['default_price'] });

        if (product.default_price) {
            const defaultPrice = product.default_price as Stripe.Price;
            if (defaultPrice.type === 'recurring') {
                return defaultPrice.id;
            }
        }

        // Fallback: first active recurring price for this product
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

    /**
     * Enforces one subscription per customer during plan switch.
     * Any non-canceled subscription other than the new checkout subscription is canceled.
     */
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

    private async resolveCurrentProductId(record: OrganizationSubscription): Promise<string | null> {
        if (record.stripeProductId) {
            return record.stripeProductId;
        }

        if (!record.stripePriceId) {
            return null;
        }

        const currentPlan = await this.getPlanByPriceId(record.stripePriceId);
        return currentPlan?.productId ?? null;
    }

    /** Extracts a product ID string from a price.product field (string | Product | DeletedProduct). */
    private extractProductId(product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined): string | null {
        if (!product) return null;
        return typeof product === 'string' ? product : product.id;
    }

    private parseProductMetadata(metadata: Stripe.Metadata): PlanMetadata {
        const { modules, unknownModules } = parseModulesMetadata(metadata['modules'] ?? '');

        if (unknownModules.length > 0) {
            this.logger.warn(`Ignoring unknown Stripe plan modules: ${unknownModules.join(', ')}`);
        }

        return {
            maxCloudAccounts: parseInt(metadata['max_cloud_accounts'] ?? '0', 10),
            maxUsers: parseInt(metadata['max_users'] ?? '0', 10),
            modules,
        };
    }

    private async syncOrganizationPlanSnapshot(organizationId: string, metadata: PlanMetadata): Promise<void> {
        await this.organizationRepository.update(
            { id: organizationId },
            {
                maxCloudAccounts: metadata.maxCloudAccounts,
                maxUsers: metadata.maxUsers,
                plans: normalizePlanModules(metadata.modules),
            }
        );
    }
}
