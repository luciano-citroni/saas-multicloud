import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudAccount } from '../db/entites/cloud-account.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { BillingModule } from '../billing/billing.module';
import { AwsAssessmentModule } from '../aws/assessment/aws-assessment.module';
import { AzureAssessmentModule } from '../azure/assessment/azure-assessment.module';
import { GcpAssessmentModule } from '../gcp/assessment/gcp-assessment.module';
import { PlanModuleGuard } from '../common/guards/plan-module.guard';

import { CloudInventoryController } from './cloud-inventory.controller';
import { CloudInventoryService } from './cloud-inventory.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([CloudAccount]),
        TenantModule,
        RbacModule,
        BillingModule,
        AwsAssessmentModule,
        AzureAssessmentModule,
        GcpAssessmentModule,
    ],
    controllers: [CloudInventoryController],
    providers: [CloudInventoryService, PlanModuleGuard],
    exports: [CloudInventoryService],
})
export class CloudInventoryModule {}
