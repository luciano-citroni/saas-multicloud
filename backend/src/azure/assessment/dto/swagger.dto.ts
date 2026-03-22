import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AzureAssessmentJobResponseDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty()
    cloudAccountId!: string;

    @ApiProperty()
    organizationId!: string;

    @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed'] })
    status!: string;

    @ApiPropertyOptional()
    error!: string | null;

    @ApiPropertyOptional({ description: 'URL para download do Excel (só quando status=completed)' })
    excelDownloadUrl?: string;

    @ApiPropertyOptional()
    completedAt!: Date | null;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}
