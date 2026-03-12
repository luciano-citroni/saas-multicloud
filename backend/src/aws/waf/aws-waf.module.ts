import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsWafController } from './aws-waf.controller';
import { AwsWafService } from './aws-waf.service';
import { AwsWafWebAcl } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsWafWebAcl]), AwsConnectorModule, TenantModule],
    controllers: [AwsWafController],
    providers: [AwsWafService],
    exports: [AwsWafService],
})
export class AwsWafModule {}
