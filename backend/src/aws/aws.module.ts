import { Module } from '@nestjs/common';
import { AwsConnectorService } from './aws-connector.service';
import { CloudModule } from '../cloud/cloud.module';

/**
 * Módulo raiz AWS.
 *
 * Exporta o AwsConnectorService para ser reutilizado por qualquer
 * submódulo AWS (networking, compute, storage, etc.).
 *
 * Uso em submódulos:
 *   imports: [AwsModule, TenantModule]
 *   → injeta AwsConnectorService no serviço do submódulo
 */
@Module({
    imports: [CloudModule],
    providers: [AwsConnectorService],
    exports: [AwsConnectorService],
})
export class AwsModule {}
