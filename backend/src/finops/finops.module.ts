import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Controller
import { FinopsController } from './controllers/finops.controller';
import { FinopsCommercialReportController } from './controllers/finops-commercial-report.controller';

// Services
import { FinopsService } from './services/finops.service';
import { FinopsAnalysisService } from './services/finops-analysis.service';
import { FinopsBudgetService } from './services/finops-budget.service';
import { FinopsSchedulerService } from './services/finops-scheduler.service';
import { FinopsCostIngestionService } from './services/finops-cost-ingestion.service';
import { FinopsCostAggregationService } from './services/finops-cost-aggregation.service';
import { FinopsAnomalyDetectionService } from './services/finops-anomaly-detection.service';
import { FinopsForecastService } from './services/finops-forecast.service';
import { FinopsMonetizationService } from './services/finops-monetization.service';
import { FinopsOptimizationService } from './services/finops-optimization.service';
import { FinopsOrgOverviewService } from './services/finops-org-overview.service';
import { FinopsResourceCostService } from './services/finops-resource-cost.service';
import { FinopsAnomalyAlertService } from './services/finops-anomaly-alert.service';
import { FinopsCommitmentsService } from './services/finops-commitments.service';
import { FinopsCommercialReportService } from './services/finops-commercial-report.service';

// Processor
import { FinopsProcessor } from './processors/finops.processor';

// Providers
import { AwsFinopsProvider } from './providers/aws-finops.provider';
import { AzureFinopsProvider } from './providers/azure-finops.provider';
import { GcpFinopsProvider } from './providers/gcp-finops.provider';

// FinOps core entities
import { FinopsConsent } from '../db/entites/finops-consent.entity';
import { FinopsCostRecord } from '../db/entites/finops-cost-record.entity';
import { FinopsBudget } from '../db/entites/finops-budget.entity';
import { FinopsBudgetAlertEvent } from '../db/entites/finops-budget-alert-event.entity';
import { FinopsAnomalyAlertSettings } from '../db/entites/finops-anomaly-alert-settings.entity';
import { FinopsAnomalyAlertEvent } from '../db/entites/finops-anomaly-alert-event.entity';
import { FinopsJob } from '../db/entites/finops-job.entity';
import { FinopsRecommendation } from '../db/entites/finops-recommendation.entity';
import { FinopsResourceChangeEvent } from '../db/entites/finops-resource-change-event.entity';

// FinOps enterprise entities
import { FinopsCostAggregate } from '../db/entites/finops-cost-aggregate.entity';
import { FinopsCostSyncRun } from '../db/entites/finops-cost-sync-run.entity';
import { FinopsCostAnomaly } from '../db/entites/finops-cost-anomaly.entity';
import { FinopsTenantBilling } from '../db/entites/finops-tenant-billing.entity';
import { FinopsCreditGrant } from '../db/entites/finops-credit-grant.entity';
import { FinopsCreditConsumption } from '../db/entites/finops-credit-consumption.entity';
import { FinopsCommitmentSnapshot } from '../db/entites/finops-commitment-snapshot.entity';
import { FinopsCommitmentRecommendation } from '../db/entites/finops-commitment-recommendation.entity';
import { FinopsExchangeRate } from '../db/entites/finops-exchange-rate.entity';
import { FinopsUsdQuote } from '../db/entites/finops-usd-quote.entity';
import { FinopsCommercialReportSettings } from '../db/entites/finops-commercial-report-settings.entity';
import { FinopsCommercialReportSend } from '../db/entites/finops-commercial-report-send.entity';

// Supporting entities
import { CloudAccount } from '../db/entites/cloud-account.entity';
import { Organization } from '../db/entites/organization.entity';
import { Tenant } from '../db/entites/tenant.entity';
import { AzureAssessmentJob } from '../db/entites/azure-assessment-job.entity';
import { AwsEc2Instance } from '../db/entites/aws-ec2.entity';
import { AwsRdsInstance } from '../db/entites/aws-rds-instance.entity';
import { AwsS3Bucket } from '../db/entites/aws-s3-bucket.entity';
import { AzureVirtualMachine } from '../db/entites/azure-virtual-machine.entity';
import { AzureDisk } from '../db/entites/azure-disk.entity';
import { GcpVmInstance } from '../db/entites/gcp-vm-instance.entity';
import { GcpSqlInstance } from '../db/entites/gcp-sql-instance.entity';

// Supporting modules
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailerModule } from '../mailer/mailer.module';
import { PlanModuleGuard } from '../common/guards/plan-module.guard';
import { FinopsResourceChangeModule } from './finops-resource-change.module';

import { FINOPS_QUEUE } from './constants';
import { GENERAL_SYNC_QUEUE } from '../aws/assessment/constants';
import { GCP_GENERAL_SYNC_QUEUE } from '../gcp/assessment/constants';
import { AZURE_ASSESSMENT_QUEUE } from '../azure/assessment/constants';

@Module({
    imports: [
        BullModule.registerQueue({ name: FINOPS_QUEUE }),
        BullModule.registerQueue({ name: GENERAL_SYNC_QUEUE }),
        BullModule.registerQueue({ name: GCP_GENERAL_SYNC_QUEUE }),
        BullModule.registerQueue({ name: AZURE_ASSESSMENT_QUEUE }),

        TypeOrmModule.forFeature([
            FinopsConsent,
            FinopsCostRecord,
            FinopsBudget,
            FinopsBudgetAlertEvent,
            FinopsAnomalyAlertSettings,
            FinopsAnomalyAlertEvent,
            FinopsJob,
            FinopsRecommendation,
            FinopsResourceChangeEvent,
            FinopsCostAggregate,
            FinopsCostSyncRun,
            FinopsCostAnomaly,
            FinopsTenantBilling,
            FinopsCreditGrant,
            FinopsCreditConsumption,
            FinopsCommitmentSnapshot,
            FinopsCommitmentRecommendation,
            FinopsExchangeRate,
            FinopsUsdQuote,
            FinopsCommercialReportSettings,
            FinopsCommercialReportSend,
            CloudAccount,
            Organization,
            Tenant,
            AzureAssessmentJob,
            AwsEc2Instance,
            AwsRdsInstance,
            AwsS3Bucket,
            AzureVirtualMachine,
            AzureDisk,
            GcpVmInstance,
            GcpSqlInstance,
        ]),

        TenantModule,
        RbacModule,
        BillingModule,
        NotificationsModule,
        MailerModule,
        FinopsResourceChangeModule,
    ],
    controllers: [FinopsController, FinopsCommercialReportController],
    providers: [
        PlanModuleGuard,
        FinopsService,
        FinopsAnalysisService,
        FinopsBudgetService,
        FinopsSchedulerService,
        FinopsCostIngestionService,
        FinopsCostAggregationService,
        FinopsAnomalyDetectionService,
        FinopsForecastService,
        FinopsMonetizationService,
        FinopsOptimizationService,
        FinopsOrgOverviewService,
        FinopsResourceCostService,
        FinopsAnomalyAlertService,
        FinopsCommitmentsService,
        FinopsCommercialReportService,
        FinopsProcessor,
        AwsFinopsProvider,
        AzureFinopsProvider,
        GcpFinopsProvider,
    ],
    exports: [
        FinopsService,
        FinopsAnalysisService,
        FinopsCostIngestionService,
        FinopsAnomalyDetectionService,
        FinopsForecastService,
        FinopsOrgOverviewService,
        FinopsResourceChangeModule,
    ],
})
export class FinopsModule {}
