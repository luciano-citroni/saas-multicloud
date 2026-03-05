import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ec2Service } from './aws-ec2.service';
import { Ec2Controller } from './aws-ec2.controller';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsEc2Instance, AwsVpc, AwsSubnet } from '../../db/entites/index';

@Module({
    imports: [TypeOrmModule.forFeature([AwsEc2Instance, AwsVpc, AwsSubnet]), AwsConnectorModule, TenantModule],
    providers: [Ec2Service],
    controllers: [Ec2Controller],
})
export class Ec2Module {}
