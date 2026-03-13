import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization, OrganizationMember, OrganizationInvite, User } from '../db/entites';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { MembersController } from './members.controller';
import { InvitesController } from './invites.controller';
import { MailerModule } from '../mailer/mailer.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Organization, OrganizationMember, OrganizationInvite, User]),
        MailerModule,
        TenantModule,
        RbacModule,
        forwardRef(() => AuthModule),
        forwardRef(() => BillingModule),
    ],
    providers: [OrganizationService],
    controllers: [OrganizationController, MembersController, InvitesController],
    exports: [OrganizationService],
})
export class OrganizationModule {}
