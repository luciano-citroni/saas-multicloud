import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsIamRoleService } from './aws-iam-role.service';
import { AwsIamRoleController } from './aws-iam-role.controller';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsIamRole } from '../../db/entites/aws-iam-role.entity';

@Module({
    imports: [TypeOrmModule.forFeature([AwsIamRole]), AwsConnectorModule, TenantModule],
    providers: [AwsIamRoleService],
    controllers: [AwsIamRoleController],
    exports: [AwsIamRoleService],
})
export class AwsIamModule {}
