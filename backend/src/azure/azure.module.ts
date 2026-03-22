import { Module } from '@nestjs/common';
import { AzureSubscriptionsModule } from './subscriptions/azure-subscriptions.module';
import { AzureComputeModule } from './compute/azure-compute.module';
import { AzureNetworkingModule } from './networking/azure-networking.module';
import { AzureStorageModule } from './storage/azure-storage.module';
import { AzureDatabasesModule } from './databases/azure-databases.module';
import { AzureWebModule } from './web/azure-web.module';
import { AzureSecurityModule } from './security/azure-security.module';
import { AzureSyncModule } from './sync/azure-sync.module';
import { AzureAssessmentModule } from './assessment/azure-assessment.module';

@Module({
    imports: [
        AzureSubscriptionsModule,
        AzureComputeModule,
        AzureNetworkingModule,
        AzureStorageModule,
        AzureDatabasesModule,
        AzureWebModule,
        AzureSecurityModule,
        AzureSyncModule,
        AzureAssessmentModule,
    ],
})
export class AzureModule {}
