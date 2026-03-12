import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsSnsController } from './aws-sns.controller';
import { AwsSnsService } from './aws-sns.service';
import { AwsSnsTopic } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsSnsTopic]), AwsConnectorModule, TenantModule],
    controllers: [AwsSnsController],
    providers: [AwsSnsService],
    exports: [AwsSnsService],
})
export class AwsSnsModule {}
