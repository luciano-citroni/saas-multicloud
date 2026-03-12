import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsCloudTrailController } from './aws-cloudtrail.controller';
import { AwsCloudTrailService } from './aws-cloudtrail.service';
import { AwsCloudTrailTrail, AwsVpc } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsCloudTrailTrail, AwsVpc]), AwsConnectorModule, TenantModule],
    controllers: [AwsCloudTrailController],
    providers: [AwsCloudTrailService],
    exports: [AwsCloudTrailService],
})
export class AwsCloudTrailModule {}
