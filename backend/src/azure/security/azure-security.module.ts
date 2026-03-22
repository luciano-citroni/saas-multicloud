import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureKeyVault } from '../../db/entites/azure-key-vault.entity';
import { AzureRecoveryVault } from '../../db/entites/azure-recovery-vault.entity';
import { AzureSecurityController } from './azure-security.controller';
import { AzureSecurityService } from './azure-security.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AzureKeyVault, AzureRecoveryVault]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureSecurityService],
    controllers: [AzureSecurityController],
    exports: [AzureSecurityService],
})
export class AzureSecurityModule {}
