import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureWebApp } from '../../db/entites/azure-web-app.entity';
import { AzureAppServicePlan } from '../../db/entites/azure-app-service-plan.entity';
import { AzureWebController } from './azure-web.controller';
import { AzureWebService } from './azure-web.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AzureWebApp, AzureAppServicePlan]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureWebService],
    controllers: [AzureWebController],
    exports: [AzureWebService],
})
export class AzureWebModule {}
