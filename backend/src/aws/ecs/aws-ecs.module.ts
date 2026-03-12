import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EcsService } from './aws-ecs.service';
import { AwsEcsController } from './aws-ecs.controller';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsEcsCluster, AwsEcsTaskDefinition, AwsEcsService as AwsEcsServiceEntity, AwsSecurityGroup, AwsIamRole } from '../../db/entites/index';
import { CloudAccount } from '../../db/entites/cloud-account.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([AwsEcsCluster, AwsEcsTaskDefinition, AwsEcsServiceEntity, CloudAccount, AwsSecurityGroup, AwsIamRole]),
        AwsConnectorModule,
        TenantModule,
    ],
    providers: [EcsService],
    controllers: [AwsEcsController],
    exports: [EcsService],
})
export class AwsEcsModule {}
