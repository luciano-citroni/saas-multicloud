import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpAssessmentArchitectureResponseDto {
    @ApiProperty({ format: 'uuid', description: 'ID da conta cloud GCP' })
    cloudAccountId!: string;

    @ApiPropertyOptional({ description: 'Data do último sync geral da conta', nullable: true })
    lastGeneralSyncAt?: Date | null;

    @ApiProperty({
        description: 'Grafo da arquitetura para React Flow',
        type: 'object',
        additionalProperties: true,
    })
    architectureGraph!: {
        nodes: unknown[];
        edges: unknown[];
    };
}

export class GcpAssessmentJobResponseDto {
    @ApiProperty({ format: 'uuid', description: 'UUID do job de assessment' })
    id!: string;

    @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed'] })
    status!: string;

    @ApiPropertyOptional({ description: 'Mensagem de erro em caso de falha' })
    error?: string;

    @ApiPropertyOptional({ description: 'URL para download do relatório Excel (disponível após conclusão)' })
    excelDownloadUrl?: string;

    @ApiPropertyOptional({ description: 'Data/hora limite para download do Excel (24h após conclusão)' })
    excelExpiresAt?: Date;

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
