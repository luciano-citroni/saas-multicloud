import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GovernanceScanResponseDto {
    @ApiProperty({ description: 'UUID do job de governança criado', format: 'uuid' })
    jobId!: string;

    @ApiProperty({ description: 'Status inicial do job', example: 'pending' })
    status!: string;

    @ApiProperty({ description: 'Mensagem de confirmação com URL de acompanhamento' })
    message!: string;
}

export class GovernanceJobStatusDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'completed', description: 'pending | running | completed | failed' })
    status!: string;

    @ApiPropertyOptional({ example: 87, description: 'Score de governança de 0 a 100 (disponível após completed)' })
    score?: number | null;

    @ApiPropertyOptional({ example: 5, description: 'Número de achados não-conformes' })
    totalFindings?: number | null;

    @ApiPropertyOptional({ example: 42, description: 'Total de verificações executadas' })
    totalChecks?: number | null;

    @ApiPropertyOptional({ description: 'Mensagem de erro (apenas quando status=failed)' })
    error?: string | null;

    @ApiProperty()
    createdAt!: Date;

    @ApiPropertyOptional()
    completedAt?: Date | null;
}

export class GovernanceFindingDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ description: 'ID do recurso AWS (ARN, nome, instance ID, etc)' })
    resourceId!: string;

    @ApiProperty({ example: 'S3Bucket', description: 'Tipo do recurso avaliado' })
    resourceType!: string;

    @ApiProperty({ example: 'aws-s3-no-public-access', description: 'ID da política que gerou o achado' })
    policyId!: string;

    @ApiProperty({ example: 'S3 Bucket Must Not Be Publicly Accessible' })
    policyName!: string;

    @ApiProperty({ example: 'critical', description: 'low | medium | high | critical' })
    severity!: string;

    @ApiProperty({ example: 'non_compliant', description: 'non_compliant | warning' })
    status!: string;

    @ApiProperty({ description: 'Descrição do problema encontrado' })
    description!: string;

    @ApiProperty({ description: 'Recomendação de correção' })
    recommendation!: string;

    @ApiPropertyOptional({ description: 'Metadados adicionais do achado' })
    metadata?: Record<string, any> | null;

    @ApiProperty()
    createdAt!: Date;
}

export class GovernanceScoreDto {
    @ApiProperty({ format: 'uuid' })
    jobId!: string;

    @ApiProperty({ example: 87, description: 'Score de governança de 0 a 100' })
    score!: number;

    @ApiProperty({ example: 5, description: 'Total de achados não-conformes' })
    totalFindings!: number;

    @ApiProperty({ example: 42, description: 'Total de verificações executadas' })
    totalChecks!: number;

    @ApiProperty({ description: 'Data da última avaliação completa' })
    evaluatedAt!: Date;
}

export class GovernancePolicyDto {
    @ApiProperty({ example: 'aws-s3-no-public-access' })
    id!: string;

    @ApiProperty({ example: 'S3 Bucket Must Not Be Publicly Accessible' })
    name!: string;

    @ApiProperty()
    description!: string;

    @ApiProperty({ example: 'S3Bucket' })
    resourceType!: string;

    @ApiProperty({ example: 'critical', description: 'low | medium | high | critical' })
    severity!: string;

    @ApiProperty({ example: 'aws', description: 'Provider alvo: aws | azure | gcp | *' })
    provider!: string;
}
