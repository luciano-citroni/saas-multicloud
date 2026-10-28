import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationsController } from './automations.controller';
import { AutomationResourcesController } from './automation-resources.controller';
import { AutomationTemplatesController } from './automation-templates.controller';
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
import { AutomationNodeRunner } from './workflow/automation-node-runner';
import { AwsAutomationProvider } from './providers/aws/aws-automation-provider';
import { AzureAutomationProvider } from './providers/azure/azure-automation-provider';
import { GcpAutomationProvider } from './providers/gcp/gcp-automation-provider';
import { AutomationExecutionProcessor } from './processors/automation-execution.processor';
import { CloudFormationAutomationService } from './cloudformation-automation.service';
import { ExistingResourceService } from './existing-resource.service';
import { AutomationInventorySyncService } from './automation-inventory-sync.service';
import { AutomationTemplateService } from './automation-template.service';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationPlanService } from './automation-plan.service';
import { AutomationPermissionCheckService } from './automation-permission-check.service';
import { ParameterCipher } from './parameter-cipher';
import { AUTOMATION_EXECUTION_QUEUE } from './constants';
import {
    Automation,
    AutomationNode,
    AutomationEdge,
    AutomationVersion,
    AutomationExecution,
    AutomationExecutionNode,
    ProvisionedResource,
    AutomationTemplate,
    AutomationTemplateVersion,
    AutomationAuditEvent,
    AwsVpc,
    AwsSubnet,
    AwsSecurityGroup,
    AwsEcrRepository,
    AwsEcsCluster,
    AwsIamRole,
    AwsSecretsManagerSecret,
    AwsLoadBalancer,
    AwsEcsService,
    AwsEcsTaskDefinition,
} from '../db/entites/index';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AwsModule } from '../aws/aws.module';
import { CloudModule } from '../cloud/cloud.module';
import { BillingModule } from '../billing/billing.module';
import { AwsEcsModule } from '../aws/ecs/aws-ecs.module';
import { AwsEcrModule } from '../aws/ecr/aws-ecr.module';
import { AwsLoadBalancerModule } from '../aws/load-balancers/aws-load-balancer.module';
import { AwsIamModule } from '../aws/iam/aws-iam-role.module';
import { AwsNetworkingModule } from '../aws/networking/aws-networking.module';
import { AwsSecurityGroupModule } from '../aws/security-groups/aws-security-group.module';
import { AwsSecretsManagerModule } from '../aws/secrets-manager/aws-secrets-manager.module';

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
            AutomationTemplate,
            AutomationTemplateVersion,
            AutomationAuditEvent,
            AwsVpc,
            AwsSubnet,
            AwsSecurityGroup,
            AwsEcrRepository,
            AwsEcsCluster,
            AwsIamRole,
            AwsSecretsManagerSecret,
            AwsLoadBalancer,
            AwsEcsService,
            AwsEcsTaskDefinition,
        ]),
        BullModule.registerQueue({ name: AUTOMATION_EXECUTION_QUEUE }),
        TenantModule,
        RbacModule,
        AwsModule,
        CloudModule,
        BillingModule,
        AwsEcsModule,
        AwsEcrModule,
        AwsLoadBalancerModule,
        AwsIamModule,
        AwsNetworkingModule,
        AwsSecurityGroupModule,
        AwsSecretsManagerModule,
    ],
    controllers: [AutomationController, AutomationsController, AutomationResourcesController, AutomationTemplatesController],
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
        AutomationNodeRunner,
        AwsAutomationProvider,
        AzureAutomationProvider,
        GcpAutomationProvider,
        AutomationExecutionProcessor,
        CloudFormationAutomationService,
        ExistingResourceService,
        AutomationInventorySyncService,
        AutomationTemplateService,
        AutomationAuditService,
        AutomationPlanService,
        AutomationPermissionCheckService,
        ParameterCipher,
    ],
    exports: [AutomationService, AutomationsCrudService],
})
export class AutomationModule {}
