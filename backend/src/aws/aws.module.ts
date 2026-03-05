import { Module } from '@nestjs/common';
import { AwsConnectorModule } from './aws-connector.module';
import { AwsNetworkingModule } from './networking/aws-networking.module';
import { Ec2Module } from './ec2/aws-ec2.module';

@Module({
    imports: [AwsConnectorModule, AwsNetworkingModule, Ec2Module],
    exports: [AwsConnectorModule],
})
export class AwsModule {}
