import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantMember } from '../db/entites/tenant-member.entity';
import { Tenant } from '../db/entites/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantGuard } from './tenant.guard';

@Module({
    imports: [TypeOrmModule.forFeature([TenantMember, Tenant])],
    providers: [TenantService, TenantGuard],
    exports: [TenantService, TenantGuard],
})
export class TenantModule {}
