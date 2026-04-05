import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

// Controller
import { FinopsController } from './controllers/finops.controller';

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

// Processor
import { FinopsProcessor } from './processors/finops.processor';

// Providers
import { AwsFinopsProvider } from './providers/aws-finops.provider';
import { AzureFinopsProvider } from './providers/azure-finops.provider';

// FinOps core entities
import { FinopsConsent } from '../db/entites/finops-consent.entity';
import { FinopsCostRecord } from '../db/entites/finops-cost-record.entity';
import { FinopsBudget } from '../db/entites/finops-budget.entity';
import { FinopsJob } from '../db/entites/finops-job.entity';
import { FinopsRecommendation } from '../db/entites/finops-recommendation.entity';

// FinOps enterprise entities
import { FinopsCostAggregate } from '../db/entites/finops-cost-aggregate.entity';
import { FinopsCostSyncRun } from '../db/entites/finops-cost-sync-run.entity';
import { FinopsCostAnomaly } from '../db/entites/finops-cost-anomaly.entity';
import { FinopsTenantBilling } from '../db/entites/finops-tenant-billing.entity';

// Supporting entities
import { CloudAccount } from '../db/entites/cloud-account.entity';
import { AwsEc2Instance } from '../db/entites/aws-ec2.entity';
import { AwsRdsInstance } from '../db/entites/aws-rds-instance.entity';
import { AwsS3Bucket } from '../db/entites/aws-s3-bucket.entity';
import { AzureVirtualMachine } from '../db/entites/azure-virtual-machine.entity';
import { AzureDisk } from '../db/entites/azure-disk.entity';

// Supporting modules
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

import { FINOPS_QUEUE } from './constants';

@Module({
    imports: [
        BullModule.registerQueue({ name: FINOPS_QUEUE }),

        TypeOrmModule.forFeature([
            // FinOps core entities
            FinopsConsent,
            FinopsCostRecord,
            FinopsBudget,
            FinopsJob,
            FinopsRecommendation,
            // FinOps enterprise entities
            FinopsCostAggregate,
            FinopsCostSyncRun,
            FinopsCostAnomaly,
            FinopsTenantBilling,
            // Supporting entities
            CloudAccount,
            AwsEc2Instance,
            AwsRdsInstance,
            AwsS3Bucket,
            AzureVirtualMachine,
            AzureDisk,
        ]),

        TenantModule,
        RbacModule,
    ],
    controllers: [FinopsController],
    providers: [
        // Core services
        FinopsService,
        FinopsAnalysisService,
        FinopsBudgetService,
        FinopsSchedulerService,
        // Enterprise services
        FinopsCostIngestionService,
        FinopsCostAggregationService,
        FinopsAnomalyDetectionService,
        FinopsForecastService,
        FinopsMonetizationService,
        FinopsOptimizationService,
        // Processor
        FinopsProcessor,
        // Providers
        AwsFinopsProvider,
        AzureFinopsProvider,
    ],
    exports: [
        FinopsService,
        FinopsAnalysisService,
        FinopsCostIngestionService,
        FinopsAnomalyDetectionService,
        FinopsForecastService,
    ],
})
export class FinopsModule {}
