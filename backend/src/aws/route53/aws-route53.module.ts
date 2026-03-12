import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsRoute53Controller } from './aws-route53.controller';
import { AwsRoute53Service } from './aws-route53.service';
import { AwsRoute53HostedZone, AwsVpc } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsRoute53HostedZone, AwsVpc]), AwsConnectorModule, TenantModule],
    controllers: [AwsRoute53Controller],
    providers: [AwsRoute53Service],
    exports: [AwsRoute53Service],
})
export class AwsRoute53Module {}
