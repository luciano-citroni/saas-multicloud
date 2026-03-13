import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { Organization } from './organization.entity';

export enum SubscriptionStatus {
    ACTIVE = 'active',
    TRIALING = 'trialing',
    PAST_DUE = 'past_due',
    CANCELED = 'canceled',
    INCOMPLETE = 'incomplete',
    INCOMPLETE_EXPIRED = 'incomplete_expired',
    UNPAID = 'unpaid',
    PAUSED = 'paused',
}

@Entity('organization_subscriptions')
export class OrganizationSubscription {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid', name: 'organization_id', unique: true })
    organizationId!: string;

    @Column({ type: 'varchar', length: 255, name: 'stripe_customer_id', unique: true })
    stripeCustomerId!: string;

    @Column({ type: 'varchar', length: 255, name: 'stripe_subscription_id', nullable: true, unique: true })
    stripeSubscriptionId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'stripe_price_id', nullable: true })
    stripePriceId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'stripe_product_id', nullable: true })
    stripeProductId!: string | null;

    @Column({ type: 'varchar', length: 50, default: SubscriptionStatus.INCOMPLETE })
    status!: string;

    @Column({ type: 'timestamp', name: 'current_period_start', nullable: true })
    currentPeriodStart!: Date | null;

    @Column({ type: 'timestamp', name: 'current_period_end', nullable: true })
    currentPeriodEnd!: Date | null;

    @Column({ type: 'boolean', name: 'cancel_at_period_end', default: false })
    cancelAtPeriodEnd!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @OneToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;
}
