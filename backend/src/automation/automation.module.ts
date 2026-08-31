import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationsController } from './automations.controller';
import { AutomationResourcesController } from './automation-resources.controller';
import { AutomationService } from './automation.service';
import { AutomationsCrudService } from './automations-crud.service';
import { AutomationAccessService } from './automation-access.service';
import { CostEstimatorService } from './cost-estimator.service';
import { AwsProvisionerService } from './aws-provisioner.service';
import { AwsResourcesService } from './aws-resources.service';
import { WorkflowValidator } from './workflow/workflow-validator';
import { DependencyResolver } from './workflow/dependency-resolver';
import { OutputResolver } from './workflow/output-resolver';
import { WorkflowExecutor } from './workflow/workflow-executor';
import { AwsAutomationProvider } from './providers/aws/aws-automation-provider';
import { AutomationExecutionProcessor } from './processors/automation-execution.processor';
import { AUTOMATION_EXECUTION_QUEUE } from './constants';
import {
    Automation,
    AutomationNode,
    AutomationEdge,
    AutomationVersion,
    AutomationExecution,
    AutomationExecutionNode,
    ProvisionedResource,
} from '../db/entites/index';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AwsModule } from '../aws/aws.module';
import { CloudModule } from '../cloud/cloud.module';
import { BillingModule } from '../billing/billing.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Automation,
            AutomationNode,
            AutomationEdge,
            AutomationVersion,
            AutomationExecution,
            AutomationExecutionNode,
            ProvisionedResource,
        ]),
        BullModule.registerQueue({ name: AUTOMATION_EXECUTION_QUEUE }),
        TenantModule,
        RbacModule,
        AwsModule,
        CloudModule,
        BillingModule,
    ],
    controllers: [AutomationController, AutomationsController, AutomationResourcesController],
    providers: [
        AutomationService,
        AutomationsCrudService,
        AutomationAccessService,
        CostEstimatorService,
        AwsProvisionerService,
        AwsResourcesService,
        WorkflowValidator,
        DependencyResolver,
        OutputResolver,
        WorkflowExecutor,
        AwsAutomationProvider,
        AutomationExecutionProcessor,
    ],
    exports: [AutomationService, AutomationsCrudService],
})
export class AutomationModule {}
