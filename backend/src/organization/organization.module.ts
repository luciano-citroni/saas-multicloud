import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../db/entites';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Organization])],
    providers: [OrganizationService],
    controllers: [OrganizationController],
})
export class OrganizationModule {}
