import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsGuardDutyController } from './aws-guardduty.controller';
import { AwsGuardDutyService } from './aws-guardduty.service';
import { AwsGuardDutyDetector } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsGuardDutyDetector]), AwsConnectorModule, TenantModule],
    controllers: [AwsGuardDutyController],
    providers: [AwsGuardDutyService],
    exports: [AwsGuardDutyService],
})
export class AwsGuardDutyModule {}
