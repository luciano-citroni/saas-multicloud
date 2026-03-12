import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsLambdaController } from './aws-lambda.controller';
import { AwsLambdaService } from './aws-lambda.service';
import { AwsLambdaFunction, AwsVpc, AwsSubnet, AwsSecurityGroup, AwsIamRole } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsLambdaFunction, AwsVpc, AwsSubnet, AwsSecurityGroup, AwsIamRole]), AwsConnectorModule, TenantModule],
    controllers: [AwsLambdaController],
    providers: [AwsLambdaService],
    exports: [AwsLambdaService],
})
export class AwsLambdaModule {}
