import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
    type Relation
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum TenantSubscriptionStatus {
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

    @Column({ type: 'uuid', name: 'tenant_id', unique: true })
    tenantId!: string;

    @Column({ type: 'varchar', length: 255, name: 'stripe_customer_id', unique: true })
    stripeCustomerId!: string;

    @Column({ type: 'varchar', length: 255, name: 'stripe_subscription_id', nullable: true, unique: true })
    stripeSubscriptionId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'stripe_price_id', nullable: true })
    stripePriceId!: string | null;

    @Column({ type: 'varchar', length: 255, name: 'stripe_product_id', nullable: true })
    stripeProductId!: string | null;

    @Column({ type: 'varchar', length: 50, default: TenantSubscriptionStatus.INCOMPLETE })
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

    @OneToOne(() => Tenant)
    @JoinColumn({ name: 'tenant_id' })
    tenant!: Relation<Tenant>;
}
