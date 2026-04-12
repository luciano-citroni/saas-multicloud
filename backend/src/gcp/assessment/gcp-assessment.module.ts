import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { CloudSyncJob } from '../../db/entites/cloud-sync-job.entity';
import { GcpAssessmentJob } from '../../db/entites/gcp-assessment-job.entity';
import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';
import { GcpVpcNetwork } from '../../db/entites/gcp-vpc-network.entity';
import { GcpSubnetwork } from '../../db/entites/gcp-subnetwork.entity';
import { GcpFirewallRule } from '../../db/entites/gcp-firewall-rule.entity';
import { GcpStorageBucket } from '../../db/entites/gcp-storage-bucket.entity';
import { GcpSqlInstance } from '../../db/entites/gcp-sql-instance.entity';
import { GcpServiceAccount } from '../../db/entites/gcp-service-account.entity';
import { GcpGkeCluster } from '../../db/entites/gcp-gke-cluster.entity';
import { GcpCdnBackendService } from '../../db/entites/gcp-cdn-backend-service.entity';
import { GcpCloudRunService } from '../../db/entites/gcp-cloud-run-service.entity';
import { GcpCloudRunJob } from '../../db/entites/gcp-cloud-run-job.entity';

import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { BillingModule } from '../../billing/billing.module';

import { GcpComputeModule } from '../compute/gcp-compute.module';
import { GcpNetworkingModule } from '../networking/gcp-networking.module';
import { GcpStorageModule } from '../storage/gcp-storage.module';
import { GcpSqlModule } from '../sql/gcp-sql.module';
import { GcpIamModule } from '../iam/gcp-iam.module';
import { GcpGkeModule } from '../gke/gcp-gke.module';
import { GcpCdnModule } from '../cdn/gcp-cdn.module';
import { GcpCloudRunModule } from '../cloudrun/gcp-cloudrun.module';

import { GCP_ASSESSMENT_QUEUE, GCP_GENERAL_SYNC_QUEUE } from './constants';
import { GcpAssessmentController } from './gcp-assessment.controller';
import { GcpAssessmentService } from './gcp-assessment.service';
import { GcpAssessmentProcessor } from './gcp-assessment.processor';
import { GcpGeneralSyncProcessor } from './gcp-general-sync.processor';
import { GcpAssessmentSyncService } from './gcp-assessment-sync.service';
import { GcpAssessmentReportService } from './gcp-assessment-report.service';
import { GcpAssessmentExcelService } from './gcp-assessment-excel.service';
import { GcpAssessmentArchitectureService } from './gcp-assessment-architecture.service';

@Module({
    imports: [
        BullModule.registerQueue({ name: GCP_ASSESSMENT_QUEUE }),
        BullModule.registerQueue({ name: GCP_GENERAL_SYNC_QUEUE }),
        TypeOrmModule.forFeature([
            CloudAccount,
            CloudSyncJob,
            GcpAssessmentJob,
            GcpVmInstance,
            GcpVpcNetwork,
            GcpSubnetwork,
            GcpFirewallRule,
            GcpStorageBucket,
            GcpSqlInstance,
            GcpServiceAccount,
            GcpGkeCluster,
            GcpCdnBackendService,
            GcpCloudRunService,
            GcpCloudRunJob,
        ]),
        TenantModule,
        RbacModule,
        BillingModule,
        GcpComputeModule,
        GcpNetworkingModule,
        GcpStorageModule,
        GcpSqlModule,
        GcpIamModule,
        GcpGkeModule,
        GcpCdnModule,
        GcpCloudRunModule,
    ],
    providers: [
        GcpAssessmentService,
        GcpAssessmentProcessor,
        GcpGeneralSyncProcessor,
        GcpAssessmentSyncService,
        GcpAssessmentReportService,
        GcpAssessmentExcelService,
        GcpAssessmentArchitectureService,
    ],
    controllers: [GcpAssessmentController],
})
export class GcpAssessmentModule {}
