import { Module } from '@nestjs/common';
import { AwsConnectorService } from './aws-connector.service';
import { CloudModule } from '../cloud/cloud.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
    imports: [CloudModule, RbacModule],
    providers: [AwsConnectorService],
    exports: [AwsConnectorService, CloudModule, RbacModule],
})
export class AwsConnectorModule {}
