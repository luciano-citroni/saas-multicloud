import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { CloudAccount } from '../db/entites/cloud-account.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

/**
 * Módulo de contas de cloud.
 * Importa TenantModule e RbacModule para ter acesso ao TenantGuard e RolesGuard.
 */
@Module({
    imports: [TypeOrmModule.forFeature([CloudAccount]), TenantModule, RbacModule],
    providers: [CloudService],
    controllers: [CloudController],
    exports: [CloudService],
})
export class CloudModule {}
