import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpGkeCluster } from '../../db/entites/gcp-gke-cluster.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpGkeService } from './gcp-gke.service';
import { GcpGkeController } from './gcp-gke.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpGkeCluster]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpGkeService],
    controllers: [GcpGkeController],
    exports: [GcpGkeService],
})
export class GcpGkeModule {}
