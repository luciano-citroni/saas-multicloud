import { Module } from '@nestjs/common';
import { CloudModule } from '../cloud/cloud.module';
import { GcpConnectorService } from './gcp-connector.service';

@Module({
    imports: [CloudModule],
    providers: [GcpConnectorService],
    exports: [GcpConnectorService],
})
export class GcpConnectorModule {}
