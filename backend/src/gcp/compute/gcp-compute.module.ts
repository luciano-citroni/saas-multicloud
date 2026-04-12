import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpComputeService } from './gcp-compute.service';
import { GcpComputeController } from './gcp-compute.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpVmInstance]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpComputeService],
    controllers: [GcpComputeController],
    exports: [GcpComputeService],
})
export class GcpComputeModule {}
