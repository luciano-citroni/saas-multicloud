import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsEcrController } from './aws-ecr.controller';
import { AwsEcrService } from './aws-ecr.service';
import { AwsEcrRepository } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsEcrRepository]), AwsConnectorModule, TenantModule],
    controllers: [AwsEcrController],
    providers: [AwsEcrService],
    exports: [AwsEcrService],
})
export class AwsEcrModule {}
