import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import { BullModule } from '@nestjs/bullmq';

import { CloudController } from './cloud.controller';

import { CloudService } from './cloud.service';

import { CloudAccount } from '../db/entites/cloud-account.entity';

import { AzureAssessmentJob } from '../db/entites/azure-assessment-job.entity';

import { TenantModule } from '../tenant/tenant.module';

import { RbacModule } from '../rbac/rbac.module';

import { BillingModule } from '../billing/billing.module';

import { GENERAL_SYNC_QUEUE } from '../aws/assessment/constants';
import { GCP_GENERAL_SYNC_QUEUE } from '../gcp/assessment/constants';

/**


 * Módulo de contas de cloud.


 * Importa TenantModule e RbacModule para ter acesso ao TenantGuard e RolesGuard.


 */

@Module({
    imports: [
        TypeOrmModule.forFeature([CloudAccount, AzureAssessmentJob]),
        BullModule.registerQueue({ name: GENERAL_SYNC_QUEUE }),
        BullModule.registerQueue({ name: GCP_GENERAL_SYNC_QUEUE }),
        TenantModule,
        RbacModule,
        BillingModule,
    ],

    providers: [CloudService],

    controllers: [CloudController],

    exports: [CloudService],
})
export class CloudModule {}
