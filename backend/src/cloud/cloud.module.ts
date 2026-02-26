import { Module } from '@nestjs/common';
import { CloudController } from './cloud.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

/**
 * Módulo de contas de cloud.
 * Importa TenantModule e RbacModule para ter acesso ao TenantGuard e RolesGuard.
 */
@Module({
    imports: [TenantModule, RbacModule],
    controllers: [CloudController],
})
export class CloudModule {}
