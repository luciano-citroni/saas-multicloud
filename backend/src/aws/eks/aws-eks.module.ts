import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsEksController } from './aws-eks.controller';
import { AwsEksService } from './aws-eks.service';
import { AwsEksCluster, AwsVpc, AwsSecurityGroup, AwsIamRole, AwsEc2Instance } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsEksCluster, AwsVpc, AwsSecurityGroup, AwsIamRole, AwsEc2Instance]), AwsConnectorModule, TenantModule],
    controllers: [AwsEksController],
    providers: [AwsEksService],
    exports: [AwsEksService],
})
export class AwsEksModule {}
