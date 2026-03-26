import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureSyncController } from './azure-sync.controller';
import { AzureSyncService } from './azure-sync.service';
import { AzureSubscriptionsModule } from '../subscriptions/azure-subscriptions.module';
import { AzureComputeModule } from '../compute/azure-compute.module';
import { AzureNetworkingModule } from '../networking/azure-networking.module';
import { AzureStorageModule } from '../storage/azure-storage.module';
import { AzureDatabasesModule } from '../databases/azure-databases.module';
import { AzureWebModule } from '../web/azure-web.module';
import { AzureSecurityModule } from '../security/azure-security.module';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { CloudSyncJob } from '../../db/entites/cloud-sync-job.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([CloudAccount, CloudSyncJob]),
        AzureSubscriptionsModule,
        AzureComputeModule,
        AzureNetworkingModule,
        AzureStorageModule,
        AzureDatabasesModule,
        AzureWebModule,
        AzureSecurityModule,
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureSyncService],
    controllers: [AzureSyncController],
    exports: [AzureSyncService],
})
export class AzureSyncModule {}
