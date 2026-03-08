import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudFrontService } from './aws-cloudfront.service';
import { CloudFrontController } from './aws-cloudfront.controller';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsCloudFrontDistribution } from '../../db/entites/aws-cloudfront-distribution.entity';
import { AwsS3Bucket } from '../../db/entites/aws-s3-bucket.entity';

@Module({
    imports: [TypeOrmModule.forFeature([AwsCloudFrontDistribution, AwsS3Bucket]), AwsConnectorModule, TenantModule],
    providers: [CloudFrontService],
    controllers: [CloudFrontController],
    exports: [CloudFrontService],
})
export class AwsCloudFrontModule {}
