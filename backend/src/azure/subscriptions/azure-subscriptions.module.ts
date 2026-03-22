import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureSubscription } from '../../db/entites/azure-subscription.entity';
import { AzureResourceGroup } from '../../db/entites/azure-resource-group.entity';
import { AzureSubscriptionsController } from './azure-subscriptions.controller';
import { AzureSubscriptionsService } from './azure-subscriptions.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AzureSubscription, AzureResourceGroup]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureSubscriptionsService],
    controllers: [AzureSubscriptionsController],
    exports: [AzureSubscriptionsService],
})
export class AzureSubscriptionsModule {}
