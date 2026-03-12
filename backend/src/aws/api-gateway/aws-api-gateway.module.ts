import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsApiGatewayController } from './aws-api-gateway.controller';
import { AwsApiGatewayService } from './aws-api-gateway.service';
import { AwsApiGatewayRestApi, AwsVpc } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsApiGatewayRestApi, AwsVpc]), AwsConnectorModule, TenantModule],
    controllers: [AwsApiGatewayController],
    providers: [AwsApiGatewayService],
    exports: [AwsApiGatewayService],
})
export class AwsApiGatewayModule {}
