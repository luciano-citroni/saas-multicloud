import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsCloudWatchController } from './aws-cloudwatch.controller';
import { AwsCloudWatchService } from './aws-cloudwatch.service';
import { AwsCloudWatchAlarm } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsCloudWatchAlarm]), AwsConnectorModule, TenantModule],
    controllers: [AwsCloudWatchController],
    providers: [AwsCloudWatchService],
    exports: [AwsCloudWatchService],
})
export class AwsCloudWatchModule {}
