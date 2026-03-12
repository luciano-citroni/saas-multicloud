import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Service } from './aws-s3.service';
import { S3Controller } from './aws-s3.controller';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';

@Module({
    imports: [TypeOrmModule.forFeature([AwsS3Bucket]), AwsConnectorModule, TenantModule],
    providers: [S3Service],
    controllers: [S3Controller],
    exports: [S3Service],
})
export class AwsS3Module {}
