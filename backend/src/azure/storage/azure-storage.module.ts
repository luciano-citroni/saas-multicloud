import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureStorageAccount } from '../../db/entites/azure-storage-account.entity';
import { AzureStorageController } from './azure-storage.controller';
import { AzureStorageService } from './azure-storage.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AzureStorageAccount]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureStorageService],
    controllers: [AzureStorageController],
    exports: [AzureStorageService],
})
export class AzureStorageModule {}
