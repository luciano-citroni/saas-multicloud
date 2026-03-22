import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AzureAssessmentJob } from '../../db/entites/azure-assessment-job.entity';
import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { AzureSubscription } from '../../db/entites/azure-subscription.entity';
import { AzureResourceGroup } from '../../db/entites/azure-resource-group.entity';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureVmss } from '../../db/entites/azure-vmss.entity';
import { AzureAksCluster } from '../../db/entites/azure-aks-cluster.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';
import { AzureWebApp } from '../../db/entites/azure-web-app.entity';
import { AzureAppServicePlan } from '../../db/entites/azure-app-service-plan.entity';
import { AzureVirtualNetwork } from '../../db/entites/azure-virtual-network.entity';
import { AzureNetworkInterface } from '../../db/entites/azure-network-interface.entity';
import { AzurePublicIp } from '../../db/entites/azure-public-ip.entity';
import { AzureNsg } from '../../db/entites/azure-nsg.entity';
import { AzureLoadBalancer } from '../../db/entites/azure-load-balancer.entity';
import { AzureApplicationGateway } from '../../db/entites/azure-application-gateway.entity';
import { AzureStorageAccount } from '../../db/entites/azure-storage-account.entity';
import { AzureSqlServer } from '../../db/entites/azure-sql-server.entity';
import { AzureSqlDatabase } from '../../db/entites/azure-sql-database.entity';
import { AzurePostgresServer } from '../../db/entites/azure-postgres-server.entity';
import { AzureCosmosDb } from '../../db/entites/azure-cosmos-db.entity';
import { AzureKeyVault } from '../../db/entites/azure-key-vault.entity';
import { AzureRecoveryVault } from '../../db/entites/azure-recovery-vault.entity';
import { AzureSyncModule } from '../sync/azure-sync.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { BillingModule } from '../../billing/billing.module';
import { AZURE_ASSESSMENT_QUEUE } from './constants';
import { AzureAssessmentController } from './azure-assessment.controller';
import { AzureAssessmentService } from './azure-assessment.service';
import { AzureAssessmentProcessor } from './azure-assessment.processor';
import { AzureAssessmentReportService } from './azure-assessment-report.service';
import { AzureAssessmentExcelService } from './azure-assessment-excel.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            AzureAssessmentJob,
            CloudAccount,
            AzureSubscription,
            AzureResourceGroup,
            AzureVirtualMachine,
            AzureVmss,
            AzureAksCluster,
            AzureDisk,
            AzureWebApp,
            AzureAppServicePlan,
            AzureVirtualNetwork,
            AzureNetworkInterface,
            AzurePublicIp,
            AzureNsg,
            AzureLoadBalancer,
            AzureApplicationGateway,
            AzureStorageAccount,
            AzureSqlServer,
            AzureSqlDatabase,
            AzurePostgresServer,
            AzureCosmosDb,
            AzureKeyVault,
            AzureRecoveryVault,
        ]),
        BullModule.registerQueue({ name: AZURE_ASSESSMENT_QUEUE }),
        AzureSyncModule,
        TenantModule,
        RbacModule,
        BillingModule,
    ],
    providers: [AzureAssessmentService, AzureAssessmentProcessor, AzureAssessmentReportService, AzureAssessmentExcelService],
    controllers: [AzureAssessmentController],
})
export class AzureAssessmentModule {}
