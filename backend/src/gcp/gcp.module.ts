import { Module } from '@nestjs/common';
import { GcpAssessmentModule } from './assessment/gcp-assessment.module';

@Module({
    imports: [GcpAssessmentModule],
})
export class GcpModule {}
