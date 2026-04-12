import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpCloudRunService as GcpCloudRunServiceEntity } from '../../db/entites/gcp-cloud-run-service.entity';
import { GcpCloudRunJob } from '../../db/entites/gcp-cloud-run-job.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpCloudRunService } from './gcp-cloudrun.service';
import { GcpCloudRunController } from './gcp-cloudrun.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpCloudRunServiceEntity, GcpCloudRunJob]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpCloudRunService],
    controllers: [GcpCloudRunController],
    exports: [GcpCloudRunService],
})
export class GcpCloudRunModule {}
