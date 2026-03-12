import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsSecretsManagerController } from './aws-secrets-manager.controller';
import { AwsSecretsManagerService } from './aws-secrets-manager.service';
import { AwsSecretsManagerSecret } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsSecretsManagerSecret]), AwsConnectorModule, TenantModule],
    controllers: [AwsSecretsManagerController],
    providers: [AwsSecretsManagerService],
    exports: [AwsSecretsManagerService],
})
export class AwsSecretsManagerModule {}
