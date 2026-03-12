import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsKmsController } from './aws-kms.controller';
import { AwsKmsService } from './aws-kms.service';
import { AwsKmsKey } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsKmsKey]), AwsConnectorModule, TenantModule],
    controllers: [AwsKmsController],
    providers: [AwsKmsService],
    exports: [AwsKmsService],
})
export class AwsKmsModule {}
