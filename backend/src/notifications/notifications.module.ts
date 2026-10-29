import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationNotificationEmail } from '../db/entites/organization-notification-email.entity';
import { OrganizationNotificationGroup } from '../db/entites/organization-notification-group.entity';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([OrganizationNotificationGroup, OrganizationNotificationEmail]),
        MailerModule,
        TenantModule,
        RbacModule,
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService],
    exports: [NotificationsService],
})
export class NotificationsModule {}
