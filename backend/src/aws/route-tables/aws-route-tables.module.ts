import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsRouteTablesController } from './aws-route-tables.controller';
import { AwsRouteTablesService } from './aws-route-tables.service';
import { AwsRouteTable, AwsVpc, AwsSubnet } from '../../db/entites/index';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';

@Module({
    imports: [TypeOrmModule.forFeature([AwsRouteTable, AwsVpc, AwsSubnet]), AwsConnectorModule, TenantModule],
    controllers: [AwsRouteTablesController],
    providers: [AwsRouteTablesService],
    exports: [AwsRouteTablesService],
})
export class AwsRouteTablesModule {}
