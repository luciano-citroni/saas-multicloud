import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsSecurityGroupController } from './aws-security-group.controller';
import { AwsSecurityGroupService } from './aws-security-group.service';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsSecurityGroup } from '../../db/entites/aws-security-group.entity';
import { AwsVpc } from '../../db/entites/index';

@Module({
    imports: [TypeOrmModule.forFeature([AwsSecurityGroup, AwsVpc]), AwsConnectorModule, TenantModule],
    controllers: [AwsSecurityGroupController],
    providers: [AwsSecurityGroupService],
    exports: [AwsSecurityGroupService],
})
export class AwsSecurityGroupModule {}
