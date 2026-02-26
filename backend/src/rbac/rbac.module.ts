import { Module } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

/**
 * Módulo de RBAC.
 * Exporte o RolesGuard para que outros módulos possam injetá-lo.
 *
 * O RolesGuard usa apenas o Reflector (fornecido pelo NestJS core),
 * portanto não precisa de imports de banco de dados.
 */
@Module({
    providers: [RolesGuard],
    exports: [RolesGuard],
})
export class RbacModule {}
