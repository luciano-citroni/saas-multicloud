import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../db/entites/tenant.entity';
import { TenantMember } from '../db/entites/tenant-member.entity';
import { TenantInvite } from '../db/entites/tenant-invite.entity';
import { User } from '../db/entites/user.entity';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';
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
        TypeOrmModule.forFeature([Tenant, TenantMember, TenantInvite, User, Organization, OrganizationMembership]),
        MailerModule,
        TenantModule,
        RbacModule,
        forwardRef(() => AuthModule),
        forwardRef(() => BillingModule),
    ],
    providers: [OrganizationService],
    controllers: [MembersController, InvitesController, OrganizationController],
    exports: [OrganizationService],
})
export class OrganizationModule {}
