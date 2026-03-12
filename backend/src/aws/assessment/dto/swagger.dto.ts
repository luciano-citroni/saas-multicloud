import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartAssessmentDto {
    @ApiProperty({ description: 'Executa sincronização completa antes do assessment', default: true })
    sync: boolean = true;
}

export class AssessmentJobResponseDto {
    @ApiProperty({ description: 'UUID do job de assessment', example: '550e8400-e29b-41d4-a716-446655440000' })
    jobId: string;

    @ApiProperty({ description: 'Status do job', enum: ['pending', 'running', 'completed', 'failed'] })
    status: string;

    @ApiProperty({ description: 'Mensagem descritiva' })
    message: string;
}

export class AssessmentArchitectureResponseDto {
    @ApiProperty({ description: 'ID da conta cloud', example: '550e8400-e29b-41d4-a716-446655440000' })
    cloudAccountId: string;

    @ApiPropertyOptional({ description: 'Data do último sync geral da conta', nullable: true })
    lastGeneralSyncAt?: Date | null;

    @ApiProperty({
        description: 'Estrutura da nuvem gerada a partir dos dados das tabelas',
        type: 'object',
        additionalProperties: true,
    })
    architectureJson: object;

    @ApiProperty({ description: 'Diagrama no formato Mermaid' })
    mermaidDiagram: string;
}

export class GeneralSyncJobResponseDto {
    @ApiProperty({ description: 'ID do job de sync geral enfileirado' })
    id: string;

    @ApiProperty({ description: 'Status inicial do job', example: 'pending' })
    status: string;

    @ApiProperty({ description: 'Mensagem descritiva' })
    message: string;
}

export class GeneralSyncJobStatusResponseDto {
    @ApiProperty({ description: 'ID do job de sync' })
    id: string;

    @ApiProperty({ description: 'Estado do job na fila' })
    status: string;

    @ApiPropertyOptional({ description: 'Motivo da falha, quando houver' })
    failedReason?: string;

    @ApiProperty({ description: 'Data de criação do job' })
    createdAt: Date;

    @ApiPropertyOptional({ description: 'Data de conclusão do job, quando houver' })
    completedAt?: Date;
}

export class AssessmentStatusResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed'] })
    status: string;

    @ApiPropertyOptional({ description: 'Mensagem de erro em caso de falha' })
    error?: string;

    @ApiPropertyOptional({ description: 'URL para download do Excel' })
    excelDownloadUrl?: string;

    @ApiProperty()
    createdAt: Date;

    @ApiPropertyOptional()
    completedAt?: Date;
}

export class AssessmentSummaryDto {
    @ApiProperty()
    totalResources: number;

    @ApiProperty()
    byType: Record<string, number>;

    @ApiProperty()
    vpcs: number;

    @ApiProperty()
    subnets: number;

    @ApiProperty()
    ec2Instances: number;

    @ApiProperty()
    ecsClusters: number;

    @ApiProperty()
    eksClusters: number;

    @ApiProperty()
    rdsDatabases: number;

    @ApiProperty()
    s3Buckets: number;

    @ApiProperty()
    lambdaFunctions: number;
}
