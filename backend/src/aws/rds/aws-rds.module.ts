import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsRdsController } from './aws-rds.controller';
import { AwsRdsService } from './aws-rds.service';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsRdsInstance, AwsVpc, AwsSubnet, AwsSecurityGroup, AwsIamRole } from '../../db/entites/index';

@Module({
    imports: [TypeOrmModule.forFeature([AwsRdsInstance, AwsVpc, AwsSubnet, AwsSecurityGroup, AwsIamRole]), AwsConnectorModule, TenantModule],
    providers: [AwsRdsService],
    controllers: [AwsRdsController],
})
export class AwsRdsModule {}
