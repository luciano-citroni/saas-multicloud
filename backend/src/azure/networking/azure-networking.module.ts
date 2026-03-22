import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureVirtualNetwork } from '../../db/entites/azure-virtual-network.entity';
import { AzureNetworkInterface } from '../../db/entites/azure-network-interface.entity';
import { AzurePublicIp } from '../../db/entites/azure-public-ip.entity';
import { AzureNsg } from '../../db/entites/azure-nsg.entity';
import { AzureLoadBalancer } from '../../db/entites/azure-load-balancer.entity';
import { AzureApplicationGateway } from '../../db/entites/azure-application-gateway.entity';
import { AzureNetworkingController } from './azure-networking.controller';
import { AzureNetworkingService } from './azure-networking.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            AzureVirtualNetwork,
            AzureNetworkInterface,
            AzurePublicIp,
            AzureNsg,
            AzureLoadBalancer,
            AzureApplicationGateway,
        ]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureNetworkingService],
    controllers: [AzureNetworkingController],
    exports: [AzureNetworkingService],
})
export class AzureNetworkingModule {}
