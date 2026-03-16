import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationSubscription } from '../db/entites/organization-subscription.entity';
import { Organization } from '../db/entites/organization.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
    imports: [TypeOrmModule.forFeature([OrganizationSubscription, Organization]), TenantModule, RbacModule],
    providers: [BillingService],
    controllers: [BillingController, BillingWebhookController],
    exports: [BillingService],
})
export class BillingModule {}
