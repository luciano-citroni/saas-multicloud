import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpCdnBackendService } from '../../db/entites/gcp-cdn-backend-service.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpCdnService } from './gcp-cdn.service';
import { GcpCdnController } from './gcp-cdn.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpCdnBackendService]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpCdnService],
    controllers: [GcpCdnController],
    exports: [GcpCdnService],
})
export class GcpCdnModule {}
