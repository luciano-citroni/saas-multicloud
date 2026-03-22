import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureVmss } from '../../db/entites/azure-vmss.entity';
import { AzureAksCluster } from '../../db/entites/azure-aks-cluster.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';
import { AzureComputeController } from './azure-compute.controller';
import { AzureComputeService } from './azure-compute.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AzureVirtualMachine, AzureVmss, AzureAksCluster, AzureDisk]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureComputeService],
    controllers: [AzureComputeController],
    exports: [AzureComputeService],
})
export class AzureComputeModule {}
