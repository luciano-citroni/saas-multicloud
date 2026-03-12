import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsConnectorModule } from '../aws-connector.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AwsDynamoDbController } from './aws-dynamodb.controller';
import { AwsDynamoDbService } from './aws-dynamodb.service';
import { AwsDynamoDbTable } from '../../db/entites';

@Module({
    imports: [TypeOrmModule.forFeature([AwsDynamoDbTable]), AwsConnectorModule, TenantModule],
    controllers: [AwsDynamoDbController],
    providers: [AwsDynamoDbService],
    exports: [AwsDynamoDbService],
})
export class AwsDynamoDbModule {}
