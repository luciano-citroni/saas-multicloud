import { Module } from '@nestjs/common';
import { AwsConnectorService } from './aws-connector.service';
import { CloudModule } from '../cloud/cloud.module';

@Module({
    imports: [CloudModule],
    providers: [AwsConnectorService],
    exports: [AwsConnectorService],
})
export class AwsConnectorModule {}
