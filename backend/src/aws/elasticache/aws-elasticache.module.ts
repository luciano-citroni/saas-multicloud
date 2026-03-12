import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsElastiCacheController } from './aws-elasticache.controller';
import { AwsElastiCacheService } from './aws-elasticache.service';
import { AwsElastiCacheCluster, AwsVpc, AwsSecurityGroup } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsElastiCacheCluster, AwsVpc, AwsSecurityGroup]), AwsConnectorModule, TenantModule],
    controllers: [AwsElastiCacheController],
    providers: [AwsElastiCacheService],
    exports: [AwsElastiCacheService],
})
export class AwsElastiCacheModule {}
