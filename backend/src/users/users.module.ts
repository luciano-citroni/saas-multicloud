import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../db/entites/user.entity';
import { OrganizationMember } from '../db/entites/organization-member.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
    imports: [TypeOrmModule.forFeature([User, OrganizationMember]), TenantModule],
    providers: [UsersService],
    controllers: [UsersController],
    exports: [UsersService],
})
export class UsersModule {}
