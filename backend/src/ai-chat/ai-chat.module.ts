import { Module } from '@nestjs/common';
import { CloudIntelligenceModule } from '../cloud-intelligence/cloud-intelligence.module';

/**
 * @deprecated Prefer CloudIntelligenceModule.
 * Kept as a thin re-export for backward-compatible imports.
 */
@Module({
    imports: [CloudIntelligenceModule],
    exports: [CloudIntelligenceModule],
})
export class AiChatModule {}
