import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsLoadBalancerService } from './aws-load-balancer.service';
import { AwsLoadBalancerController } from './aws-load-balancer.controller';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsLoadBalancer, AwsLoadBalancerListener, AwsVpc, AwsSubnet, AwsSecurityGroup } from '../../db/entites/index';

@Module({
    imports: [TypeOrmModule.forFeature([AwsLoadBalancer, AwsLoadBalancerListener, AwsVpc, AwsSubnet, AwsSecurityGroup]), AwsConnectorModule, TenantModule],
    providers: [AwsLoadBalancerService],
    controllers: [AwsLoadBalancerController],
})
export class AwsLoadBalancerModule {}
