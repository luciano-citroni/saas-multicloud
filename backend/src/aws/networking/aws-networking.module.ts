import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsNetworkingController } from './aws-networking.controller';
import { AwsNetworkingService } from './aws-networking.service';
import { AwsModule } from '../aws.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsVpc, AwsSubnet } from '../../db/entites/index';

@Module({
    imports: [TypeOrmModule.forFeature([AwsVpc, AwsSubnet]), AwsModule, TenantModule],
    controllers: [AwsNetworkingController],
    providers: [AwsNetworkingService],
})
export class AwsNetworkingModule {}
