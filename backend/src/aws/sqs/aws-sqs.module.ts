import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsSqsController } from './aws-sqs.controller';
import { AwsSqsService } from './aws-sqs.service';
import { AwsSqsQueue } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsSqsQueue]), AwsConnectorModule, TenantModule],
    controllers: [AwsSqsController],
    providers: [AwsSqsService],
    exports: [AwsSqsService],
})
export class AwsSqsModule {}
