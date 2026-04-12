import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpServiceAccount } from '../../db/entites/gcp-service-account.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpIamService } from './gcp-iam.service';
import { GcpIamController } from './gcp-iam.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpServiceAccount]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpIamService],
    controllers: [GcpIamController],
    exports: [GcpIamService],
})
export class GcpIamModule {}
