import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationNotificationEmail } from '../db/entites/organization-notification-email.entity';
import { OrganizationNotificationGroup } from '../db/entites/organization-notification-group.entity';
import { OrganizationNotificationWhatsappTarget } from '../db/entites/organization-notification-whatsapp-target.entity';
import { MailerModule } from '../mailer/mailer.module';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EvolutionApiService } from './evolution-api.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrganizationNotificationGroup,
            OrganizationNotificationEmail,
            OrganizationNotificationWhatsappTarget,
        ]),
        MailerModule,
        TenantModule,
        RbacModule,
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService, EvolutionApiService],
    exports: [NotificationsService],
})
export class NotificationsModule {}
