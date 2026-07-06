import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../db/entites/user.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
    imports: [TypeOrmModule.forFeature([User, OrganizationMembership]), TenantModule],
    providers: [UsersService],
    controllers: [UsersController],
    exports: [UsersService],
})
export class UsersModule {}
