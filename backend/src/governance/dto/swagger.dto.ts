import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Scan ─────────────────────────────────────────────────────────────────────

export class GovernanceScanResponseDto {
    @ApiProperty({ description: 'UUID do job de governança criado', format: 'uuid' })
    jobId!: string;

    @ApiProperty({ description: 'Status inicial do job', example: 'pending' })
    status!: string;

    @ApiProperty({ description: 'Mensagem de confirmação com URL de acompanhamento' })
    message!: string;
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export class GovernanceJobStatusDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'aws', description: 'Provider: aws | gcp | azure' })
    provider!: string;

    @ApiProperty({ example: 'completed', description: 'pending | running | completed | failed' })
    status!: string;

    @ApiPropertyOptional({ example: 87, description: 'Score de governança 0-100 (disponível após completed)' })
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

export class PaginationMetaDto {
    @ApiProperty({ example: 1 })
    page!: number;

    @ApiProperty({ example: 25 })
    limit!: number;

    @ApiProperty({ example: 42 })
    totalItems!: number;

    @ApiProperty({ example: 2 })
    totalPages!: number;

    @ApiProperty({ example: true })
    hasNextPage!: boolean;

    @ApiProperty({ example: false })
    hasPreviousPage!: boolean;
}

export class GovernanceJobsPaginatedResponseDto {
    @ApiProperty({ type: [GovernanceJobStatusDto] })
    items!: GovernanceJobStatusDto[];

    @ApiProperty({ type: PaginationMetaDto })
    pagination!: PaginationMetaDto;
}

// ── Findings ─────────────────────────────────────────────────────────────────

export class GovernanceFindingDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ description: 'ID do recurso (ARN, nome, instance ID, etc)' })
    resourceId!: string;

    @ApiProperty({ example: 'S3Bucket', description: 'Tipo do recurso avaliado' })
    resourceType!: string;

    @ApiProperty({ example: 'aws-s3-no-public-access', description: 'ID da política' })
    policyId!: string;

    @ApiProperty({ example: 'S3 Bucket Must Not Be Publicly Accessible' })
    policyName!: string;

    @ApiProperty({ example: 'critical', description: 'low | medium | high | critical' })
    severity!: string;

    @ApiProperty({ example: 'non_compliant', description: 'non_compliant | warning' })
    status!: string;

    @ApiPropertyOptional({ example: 'storage', description: 'Categoria funcional da política' })
    category?: string | null;

    @ApiProperty({ description: 'Descrição do problema encontrado' })
    description!: string;

    @ApiProperty({ description: 'Recomendação de correção' })
    recommendation!: string;

    @ApiPropertyOptional({ description: 'Metadados adicionais do achado' })
    metadata?: Record<string, any> | null;

    @ApiProperty()
    createdAt!: Date;
}

// ── Score ─────────────────────────────────────────────────────────────────────

export class CategoryScoreDto {
    @ApiProperty({ example: 'network', description: 'Categoria de governança' })
    category!: string;

    @ApiProperty({ example: 75, description: 'Score da categoria (0-100)' })
    score!: number;

    @ApiProperty({ example: 12, description: 'Total de verificações na categoria' })
    totalChecks!: number;

    @ApiProperty({ example: 3, description: 'Verificações não-conformes na categoria' })
    nonCompliantChecks!: number;
}

export class GovernanceScoreDto {
    @ApiProperty({ format: 'uuid' })
    jobId!: string;

    @ApiProperty({ example: 'aws', description: 'Provider do scan' })
    provider!: string;

    @ApiProperty({ example: 87, description: 'Score de governança de 0 a 100' })
    score!: number;

    @ApiProperty({ example: 5, description: 'Total de achados não-conformes' })
    totalFindings!: number;

    @ApiProperty({ example: 42, description: 'Total de verificações executadas' })
    totalChecks!: number;

    @ApiProperty({ example: 2, description: 'Achados críticos não-conformes' })
    criticalFindings!: number;

    @ApiProperty({ example: 3, description: 'Achados altos não-conformes' })
    highFindings!: number;

    @ApiProperty({ type: [CategoryScoreDto], description: 'Score breakdown por categoria' })
    categoryScores!: CategoryScoreDto[];

    @ApiProperty({ description: 'Data da última avaliação completa' })
    evaluatedAt!: Date;
}

export class GovernanceScoreHistoryDto {
    @ApiProperty({ format: 'uuid' })
    jobId!: string;

    @ApiProperty({ example: 'aws' })
    provider!: string;

    @ApiProperty({ example: 87 })
    score!: number;

    @ApiProperty({ example: 5 })
    totalFindings!: number;

    @ApiProperty({ example: 42 })
    totalChecks!: number;

    @ApiProperty()
    completedAt!: Date;
}

// ── Policies ─────────────────────────────────────────────────────────────────

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

    @ApiProperty({ example: 'aws', description: 'Provider: aws | gcp | azure | *' })
    provider!: string;

    @ApiPropertyOptional({ example: 'storage', description: 'Categoria funcional: network | storage | identity | compute | logging | encryption | monitoring' })
    category?: string | null;

    @ApiProperty({ example: ['CIS_AWS_1_4', 'PCI_DSS_3_2_1'], description: 'Frameworks de compliance cobertos' })
    frameworks!: string[];
}

// ── Suppressions ─────────────────────────────────────────────────────────────

export class GovernanceSuppressionDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ format: 'uuid' })
    organizationId!: string;

    @ApiPropertyOptional({ format: 'uuid', description: 'null = aplica à organização inteira' })
    cloudAccountId?: string | null;

    @ApiProperty({ example: 'aws-s3-no-public-access', description: 'ID da política suprimida. * = todas as políticas.' })
    policyId!: string;

    @ApiPropertyOptional({ description: 'ID do recurso específico suprimido. null = todos os recursos.' })
    resourceId?: string | null;

    @ApiProperty({ description: 'Justificativa obrigatória para a supressão' })
    reason!: string;

    @ApiPropertyOptional({ description: 'Data de expiração. null = supressão permanente.' })
    expiresAt?: Date | null;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class CreateGovernanceSuppressionDto {
    @ApiProperty({ example: 'aws-s3-no-public-access', description: 'ID da política a suprimir. Use * para suprimir todas as políticas de um recurso.' })
    policyId!: string;

    @ApiPropertyOptional({ description: 'ID do recurso específico a suprimir (bucket name, instance ID, ARN, etc). Omita para suprimir todos os recursos desta política.' })
    resourceId?: string | null;

    @ApiProperty({ example: 'Bucket de logs de auditoria — acesso público intencional e aprovado pelo time de segurança (ticket #SEC-1234)', description: 'Justificativa obrigatória para auditoria' })
    reason!: string;

    @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z', description: 'Data de expiração. Omita para supressão permanente.' })
    expiresAt?: string | null;
}
