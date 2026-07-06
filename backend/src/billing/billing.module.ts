import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationSubscription } from '../db/entites/organization-subscription.entity';
import { UserSubscription } from '../db/entites/user-subscription.entity';
import { User } from '../db/entites/user.entity';
import { TenantMember } from '../db/entites/tenant-member.entity';
import { Tenant } from '../db/entites/tenant.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([OrganizationSubscription, UserSubscription, User, TenantMember, Tenant]),
        TenantModule,
        RbacModule,
    ],
    providers: [BillingService],
    controllers: [BillingController, BillingWebhookController],
    exports: [BillingService],
})
export class BillingModule {}
