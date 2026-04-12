import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpStorageBucket } from '../../db/entites/gcp-storage-bucket.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpStorageService } from './gcp-storage.service';
import { GcpStorageController } from './gcp-storage.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpStorageBucket]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpStorageService],
    controllers: [GcpStorageController],
    exports: [GcpStorageService],
})
export class GcpStorageModule {}
