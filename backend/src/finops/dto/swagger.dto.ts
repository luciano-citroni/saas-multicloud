import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Consent ─────────────────────────────────────────────────────────────────

export class FinopsConsentResponseDto {
    @ApiProperty({ format: 'uuid' })
    cloudAccountId!: string;

    @ApiProperty({ example: 'aws', description: 'aws | azure | gcp' })
    cloudProvider!: string;

    @ApiProperty({ example: true })
    accepted!: boolean;

    @ApiPropertyOptional()
    acceptedAt!: Date | null;

    @ApiProperty({ example: '1.0' })
    version!: string;

    @ApiProperty({ description: 'Texto do termo de consentimento' })
    terms!: string;
}

export class AcceptConsentRequestDto {
    @ApiProperty({ example: 'aws', description: 'aws | azure | gcp' })
    cloudProvider!: 'aws' | 'azure' | 'gcp';
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export class FinopsSyncRequestDto {
    @ApiProperty({ example: 'aws', description: 'aws | azure | gcp' })
    cloudProvider!: 'aws' | 'azure' | 'gcp';

    @ApiProperty({ example: 'monthly', description: 'daily | monthly' })
    granularity!: 'daily' | 'monthly';

    @ApiProperty({ example: '2025-01-01', description: 'Data de início no formato YYYY-MM-DD' })
    startDate!: string;

    @ApiProperty({ example: '2025-01-31', description: 'Data de fim no formato YYYY-MM-DD' })
    endDate!: string;
}

export class FinopsSyncResponseDto {
    @ApiProperty({ format: 'uuid' })
    jobId!: string;

    @ApiProperty({ example: 'pending' })
    status!: string;

    @ApiProperty()
    message!: string;
}

export class FinopsJobStatusDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'completed', description: 'pending | running | completed | failed' })
    status!: string;

    @ApiProperty({ example: 'aws' })
    cloudProvider!: string;

    @ApiProperty({ example: 'monthly', description: 'daily | monthly' })
    granularity!: string;

    @ApiProperty()
    periodStart!: Date;

    @ApiProperty()
    periodEnd!: Date;

    @ApiPropertyOptional({ example: 120 })
    recordsCollected!: number | null;

    @ApiPropertyOptional()
    error!: string | null;

    @ApiProperty()
    createdAt!: Date;

    @ApiPropertyOptional()
    completedAt!: Date | null;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export class ServiceCostBreakdownDto {
    @ApiProperty({ example: 'Amazon EC2' })
    service!: string;

    @ApiProperty({ example: 523.45 })
    cost!: number;

    @ApiProperty({ example: 34.2 })
    percentage!: number;
}

export class CloudCostBreakdownDto {
    @ApiProperty({ example: 'aws' })
    cloudProvider!: string;

    @ApiProperty({ example: 1234.56 })
    cost!: number;

    @ApiProperty({ example: 65.0 })
    percentage!: number;
}

export class CostTrendDto {
    @ApiProperty({ example: 1523.45 })
    currentPeriodCost!: number;

    @ApiProperty({ example: 1200.0 })
    previousPeriodCost!: number;

    @ApiProperty({ example: 323.45 })
    growthAmount!: number;

    @ApiProperty({ example: 26.95 })
    growthPercentage!: number;
}

export class CostSummaryDto {
    @ApiProperty({ example: 1523.45 })
    totalCost!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;

    @ApiProperty({ type: [ServiceCostBreakdownDto] })
    topServices!: ServiceCostBreakdownDto[];

    @ApiProperty({ type: [CloudCostBreakdownDto] })
    byCloud!: CloudCostBreakdownDto[];

    @ApiProperty({ type: CostTrendDto })
    trend!: CostTrendDto;
}

export class CostHistoryItemDto {
    @ApiProperty({ example: '2025-01-15' })
    date!: string;

    @ApiProperty({ example: 52.34 })
    cost!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;
}

// ─── FinOps Score ─────────────────────────────────────────────────────────────

export class FinopsScoreDto {
    @ApiProperty({ example: 78, description: 'Score geral de 0 a 100' })
    score!: number;

    @ApiProperty({ example: 85 })
    efficiencyScore!: number;

    @ApiProperty({ example: 70 })
    wasteScore!: number;

    @ApiProperty({ example: 65 })
    growthScore!: number;

    @ApiProperty({ example: 'Good', description: 'Excellent | Good | Fair | Poor' })
    label!: string;

    @ApiProperty({ type: [String], example: ['Seu custo aumentou 27% comparado ao período anterior.'] })
    insights!: string[];
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export class FinopsRecommendationDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty({ example: 'underutilized_ec2' })
    type!: string;

    @ApiProperty({ example: 'i-0abc123' })
    resourceId!: string;

    @ApiProperty({ example: 'EC2Instance' })
    resourceType!: string;

    @ApiProperty()
    description!: string;

    @ApiProperty()
    recommendation!: string;

    @ApiPropertyOptional({ example: 45.00 })
    potentialSaving!: number | null;

    @ApiProperty({ example: 'USD' })
    currency!: string;

    @ApiProperty({ example: 'high', description: 'low | medium | high' })
    priority!: string;

    @ApiProperty({ example: 'open', description: 'open | dismissed | resolved' })
    status!: string;

    @ApiProperty()
    createdAt!: Date;
}

// ─── Saving Opportunity ───────────────────────────────────────────────────────

export class SavingTopRecommendationDto {
    @ApiProperty({ example: 'underutilized_ec2' })
    type!: string;

    @ApiProperty()
    description!: string;

    @ApiProperty({ example: 45.00 })
    saving!: number;
}

export class SavingOpportunityDto {
    @ApiProperty({ example: 234.50 })
    potentialSaving!: number;

    @ApiProperty({ example: 15.4 })
    savingPercentage!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;

    @ApiProperty({ type: [SavingTopRecommendationDto] })
    topRecommendations!: SavingTopRecommendationDto[];
}

// ─── Cost by Service ──────────────────────────────────────────────────────────

export class CostByServiceItemDto {
    @ApiProperty({ example: 'Amazon EC2' })
    service!: string;

    @ApiProperty({ example: 523.45 })
    currentMonthCost!: number;

    @ApiProperty({ example: 410.20 })
    previousMonthCost!: number;

    @ApiProperty({ example: 113.25 })
    change!: number;

    @ApiProperty({ example: 27.6 })
    changePercentage!: number;

    @ApiProperty({ example: 'up', description: 'up | down | stable' })
    trend!: string;

    @ApiProperty({ example: 'USD' })
    currency!: string;
}

// ─── Pricing / Margin ─────────────────────────────────────────────────────────

export class PricingRequestDto {
    @ApiProperty({ example: 25, description: 'Percentual de markup a aplicar sobre o custo real' })
    markupPercentage!: number;
}

export class PricingResponseDto {
    @ApiProperty({ format: 'uuid' })
    cloudAccountId!: string;

    @ApiProperty({ example: 1523.45 })
    totalCost!: number;

    @ApiProperty({ example: 25 })
    markupPercentage!: number;

    @ApiProperty({ example: 1904.31 })
    finalPrice!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;
}

export class MarginRequestDto {
    @ApiProperty({ example: 1523.45, description: 'Custo real da nuvem' })
    realCost!: number;

    @ApiProperty({ example: 2000.00, description: 'Receita gerada pelo cliente' })
    revenue!: number;

    @ApiPropertyOptional({ example: 'USD' })
    currency?: string;
}

export class MarginResponseDto {
    @ApiProperty({ format: 'uuid' })
    cloudAccountId!: string;

    @ApiProperty({ example: 1523.45 })
    realCost!: number;

    @ApiProperty({ example: 2000.00 })
    revenue!: number;

    @ApiProperty({ example: 476.55 })
    marginAmount!: number;

    @ApiProperty({ example: 23.83 })
    marginPercentage!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export class CreateBudgetRequestDto {
    @ApiProperty({ example: 'Budget Mensal EC2' })
    name!: string;

    @ApiProperty({ example: 500.0 })
    amount!: number;

    @ApiPropertyOptional({ example: 'USD' })
    currency?: string;

    @ApiPropertyOptional({ example: 'monthly', enum: ['daily', 'monthly'] })
    period?: 'daily' | 'monthly';

    @ApiPropertyOptional({
        example: 'organization',
        enum: ['organization', 'cloud_account'],
        description: 'organization = tenant inteiro; cloud_account exige cloudAccountId',
    })
    scope?: 'organization' | 'cloud_account';

    @ApiPropertyOptional({ format: 'uuid', nullable: true })
    cloudAccountId?: string | null;

    @ApiPropertyOptional({ example: 'Amazon EC2', description: 'Filtrar por serviço. Null = todos.' })
    service?: string | null;

    @ApiPropertyOptional({ example: 'i-0123456789abcdef0', description: 'Obrigatório quando alertType=resource' })
    resourceId?: string | null;

    @ApiPropertyOptional({
        example: [80, 100],
        description: 'Percentuais de alerta (tipos percentage/resource)',
    })
    alertThresholds?: number[];

    @ApiPropertyOptional({ example: 'daily', enum: ['daily', 'monthly'] })
    alertFrequency?: 'daily' | 'monthly';

    @ApiPropertyOptional({
        example: 'amount',
        enum: ['percentage', 'amount', 'resource'],
        description: 'percentage = % do orçamento; amount = valor absoluto; resource = recurso específico',
    })
    alertType?: 'percentage' | 'amount' | 'resource';

    @ApiPropertyOptional({ example: 50, description: 'Valor absoluto do alerta quando alertType=amount' })
    alertAmount?: number | null;

    @ApiPropertyOptional({
        example: ['email', 'whatsapp'],
        description: 'Canais de alerta. Destinos vêm dos grupos de notificação selecionados.',
        isArray: true,
        enum: ['email', 'whatsapp'],
    })
    alertChannels?: Array<'email' | 'whatsapp'>;

    @ApiPropertyOptional({
        example: ['finops@empresa.com'],
        isArray: true,
        type: String,
        description: 'E-mails legados (fallback). Preferir alertNotificationGroupIds.',
    })
    alertEmails?: string[];

    @ApiPropertyOptional({
        example: ['123e4567-e89b-12d3-a456-426614174000'],
        isArray: true,
        type: String,
        format: 'uuid',
        description: 'IDs de grupos de notificação (e-mail e/ou WhatsApp) do tenant',
    })
    alertNotificationGroupIds?: string[];
}

export class BudgetDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiPropertyOptional({ format: 'uuid', nullable: true })
    cloudAccountId!: string | null;

    @ApiProperty({ example: 'organization', enum: ['organization', 'cloud_account'] })
    scope!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ example: 500.0 })
    amount!: number;

    @ApiProperty({ example: 'USD' })
    currency!: string;

    @ApiProperty({ example: 'monthly', enum: ['daily', 'monthly'] })
    period!: string;

    @ApiPropertyOptional()
    service!: string | null;

    @ApiPropertyOptional({ nullable: true })
    resourceId!: string | null;

    @ApiProperty({ example: [80, 100] })
    alertThresholds!: number[];

    @ApiProperty({ example: 'monthly', enum: ['daily', 'monthly'] })
    alertFrequency!: string;

    @ApiProperty({ example: 'percentage', enum: ['percentage', 'amount', 'resource'] })
    alertType!: string;

    @ApiPropertyOptional({ nullable: true })
    alertAmount!: number | null;

    @ApiProperty({ example: ['email'], isArray: true })
    alertChannels!: string[];

    @ApiProperty({ example: ['finops@empresa.com'], isArray: true })
    alertEmails!: string[];

    @ApiProperty({
        example: ['123e4567-e89b-12d3-a456-426614174000'],
        isArray: true,
        type: String,
    })
    alertNotificationGroupIds!: string[];

    @ApiProperty()
    isActive!: boolean;

    @ApiProperty()
    createdAt!: Date;
}

export class BudgetStatusDto {
    @ApiProperty({ type: BudgetDto })
    budget!: BudgetDto;

    @ApiProperty({ example: 321.50 })
    currentSpend!: number;

    @ApiProperty({ example: 178.50 })
    remainingAmount!: number;

    @ApiProperty({ example: 64.3 })
    usagePercentage!: number;

    @ApiProperty({ example: [], description: 'Alertas disparados (percentuais)' })
    triggeredAlerts!: number[];

    @ApiProperty({ example: 'USD' })
    currency!: string;
}
