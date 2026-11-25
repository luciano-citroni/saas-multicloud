import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsNetworkAclController } from './aws-network-acl.controller';
import { AwsNetworkAclService } from './aws-network-acl.service';
import { AwsNetworkAcl, AwsVpc } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsNetworkAcl, AwsVpc]), AwsConnectorModule, TenantModule],
    controllers: [AwsNetworkAclController],
    providers: [AwsNetworkAclService],
    exports: [AwsNetworkAclService],
})
export class AwsNetworkAclModule {}
