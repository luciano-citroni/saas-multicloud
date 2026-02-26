import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMember } from '../db/entites/organization-member.entity';
import { Organization } from '../db/entites/organization.entity';
import { TenantService } from './tenant.service';
import { TenantGuard } from './tenant.guard';

/**
 * Módulo de contexto de tenant.
 *
 * Os repositórios são registrados aqui e usados apenas pelo TenantService.
 * O TenantGuard depende do TenantService — nunca dos repositórios diretamente.
 * Isso garante que módulos que importam TenantModule não precisam conhecer
 * os detalhes de infraestrutura (repositórios) do tenant.
 */
@Module({
    imports: [TypeOrmModule.forFeature([OrganizationMember, Organization])],
    providers: [TenantService, TenantGuard],
    exports: [TenantService, TenantGuard],
})
export class TenantModule {}
