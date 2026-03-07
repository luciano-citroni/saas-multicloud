import { Module } from '@nestjs/common';
import { AwsConnectorModule } from './aws-connector.module';
import { AwsNetworkingModule } from './networking/aws-networking.module';
import { Ec2Module } from './ec2/aws-ec2.module';
import { AwsRouteTablesModule } from './route-tables/aws-route-tables.module';
import { AwsEcsModule } from './ecs/aws-ecs.module';
import { AwsLoadBalancerModule } from './load-balancers/aws-load-balancer.module';
import { AwsSecurityGroupModule } from './security-groups/aws-security-group.module';
import { AwsIamModule } from './iam/aws-iam-role.module';
import { AwsRdsModule } from './rds/aws-rds.module';

@Module({
    imports: [AwsConnectorModule, AwsNetworkingModule, Ec2Module, AwsRouteTablesModule, AwsEcsModule, AwsLoadBalancerModule, AwsSecurityGroupModule, AwsIamModule, AwsRdsModule],
    exports: [AwsConnectorModule],
})
export class AwsModule {}
