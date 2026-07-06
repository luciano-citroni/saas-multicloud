import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';
import { OrgsService } from './orgs.service';
import { OrgsController } from './orgs.controller';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
    imports: [TypeOrmModule.forFeature([Organization, OrganizationMembership]), TenantModule, RbacModule],
    providers: [OrgsService],
    controllers: [OrgsController],
    exports: [OrgsService],
})
export class OrgsModule {}
