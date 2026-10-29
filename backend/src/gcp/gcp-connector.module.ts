import { Module } from '@nestjs/common';
import { CloudModule } from '../cloud/cloud.module';
import { RbacModule } from '../rbac/rbac.module';
import { GcpConnectorService } from './gcp-connector.service';

@Module({
    imports: [CloudModule, RbacModule],
    providers: [GcpConnectorService],
    exports: [GcpConnectorService, CloudModule, RbacModule],
})
export class GcpConnectorModule {}
