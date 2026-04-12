import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpAssessmentJobResponseDto {
    @ApiProperty({ format: 'uuid', description: 'UUID do job de assessment' })
    id!: string;

    @ApiProperty({ format: 'uuid' })
    cloudAccountId!: string;

    @ApiProperty({ format: 'uuid' })
    organizationId!: string;

    @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed'] })
    status!: string;

    @ApiPropertyOptional({ nullable: true })
    error!: string | null;

    @ApiPropertyOptional({ description: 'URL para download do relatório Excel (disponível após conclusão)' })
    excelDownloadUrl?: string;

    @ApiProperty()
    createdAt!: Date;

    @ApiPropertyOptional({ nullable: true })
    completedAt?: Date;
}

export class GcpGeneralSyncJobResponseDto {
    @ApiProperty({ description: 'ID do job na fila BullMQ' })
    id!: string;

    @ApiProperty({ description: 'Estado atual do job', example: 'waiting' })
    status!: string;

    @ApiProperty({ description: 'Mensagem descritiva do status' })
    message!: string;
}

export class GcpGeneralSyncJobStatusResponseDto {
    @ApiProperty({ description: 'ID do job na fila BullMQ' })
    id!: string;

    @ApiProperty({ description: 'Estado atual do job', example: 'completed' })
    status!: string;

    @ApiPropertyOptional({ description: 'Razão da falha, se houver' })
    failedReason?: string;

    @ApiProperty({ description: 'Data de criação do job' })
    createdAt!: Date;

    @ApiPropertyOptional({ description: 'Data de conclusão do job' })
    completedAt?: Date;
}
