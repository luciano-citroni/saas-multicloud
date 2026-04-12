import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GcpVpcNetwork } from '../../db/entites/gcp-vpc-network.entity';
import { GcpSubnetwork } from '../../db/entites/gcp-subnetwork.entity';
import { GcpFirewallRule } from '../../db/entites/gcp-firewall-rule.entity';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';
import { GcpConnectorModule } from '../gcp-connector.module';

import { GcpNetworkingService } from './gcp-networking.service';
import { GcpNetworkingController } from './gcp-networking.controller';

@Module({
    imports: [TypeOrmModule.forFeature([GcpVpcNetwork, GcpSubnetwork, GcpFirewallRule]), GcpConnectorModule, TenantModule, RbacModule],
    providers: [GcpNetworkingService],
    controllers: [GcpNetworkingController],
    exports: [GcpNetworkingService],
})
export class GcpNetworkingModule {}
