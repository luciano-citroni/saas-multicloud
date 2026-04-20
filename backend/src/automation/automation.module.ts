import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationController } from './automation.controller';
import { AutomationResourcesController } from './automation-resources.controller';
import { AutomationService } from './automation.service';
import { CostEstimatorService } from './cost-estimator.service';
import { AwsProvisionerService } from './aws-provisioner.service';
import { AwsResourcesService } from './aws-resources.service';
import { AutomationExecution } from '../db/entites/automation-execution.entity';
import { ProvisionedResource } from '../db/entites/provisioned-resource.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { AwsModule } from '../aws/aws.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AutomationExecution, ProvisionedResource]),
        TenantModule,
        RbacModule,
        AwsModule,
    ],
    controllers: [AutomationController, AutomationResourcesController],
    providers: [AutomationService, CostEstimatorService, AwsProvisionerService, AwsResourcesService],
    exports: [AutomationService],
})
export class AutomationModule {}
