import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpSqlInstance } from '../../db/entites/gcp-sql-instance.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpSqlService } from './gcp-sql.service';
import { GcpSqlController } from './gcp-sql.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpSqlInstance]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpSqlService],
    controllers: [GcpSqlController],
    exports: [GcpSqlService],
})
export class GcpSqlModule {}
