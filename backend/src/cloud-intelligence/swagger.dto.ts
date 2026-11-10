import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationRequestDto {
    @ApiPropertyOptional({ maxLength: 200 })
    title?: string;
}

export class SendMessageRequestDto {
    @ApiProperty({ maxLength: 4000 })
    content!: string;

    @ApiPropertyOptional({ format: 'uuid' })
    cloudAccountId?: string;
}

export class AiChatSourceDto {
    @ApiProperty()
    module!: string;

    @ApiProperty()
    label!: string;

    @ApiPropertyOptional()
    detail?: string;

    @ApiPropertyOptional({ description: 'Trusted in-app path for deep-linking' })
    href?: string;

    @ApiPropertyOptional({ format: 'uuid' })
    cloudAccountId?: string;
}

export class AiChatMessageResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty({ enum: ['user', 'assistant', 'system', 'tool'] })
    role!: string;

    @ApiProperty()
    content!: string;

    @ApiPropertyOptional({ type: [AiChatSourceDto] })
    sources?: AiChatSourceDto[] | null;

    @ApiProperty()
    createdAt!: Date;
}

export class AiChatConversationResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    title!: string;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class AiChatConversationDetailResponseDto extends AiChatConversationResponseDto {
    @ApiProperty({ type: [AiChatMessageResponseDto] })
    messages!: AiChatMessageResponseDto[];
}

export class AiUsageBucketDto {
    @ApiProperty()
    inputTokens!: number;

    @ApiProperty()
    outputTokens!: number;

    @ApiProperty()
    estimatedCost!: number;

    @ApiProperty()
    requests!: number;
}

export class AiUsageOverviewResponseDto {
    @ApiProperty({ type: AiUsageBucketDto })
    daily!: AiUsageBucketDto;

    @ApiProperty({ type: AiUsageBucketDto })
    monthly!: AiUsageBucketDto;

    @ApiProperty({ type: [Object] })
    byAgent!: Array<AiUsageBucketDto & { agentType: string }>;

    @ApiProperty({ type: [Object] })
    byUser!: Array<AiUsageBucketDto & { userId: string | null }>;
}

export class AiQuotaResponseDto {
    @ApiProperty()
    enabled!: boolean;

    @ApiPropertyOptional({ enum: ['basic', 'professional', 'enterprise'] })
    tier?: string;

    @ApiPropertyOptional({ type: [String] })
    capabilities?: string[];

    @ApiPropertyOptional({ nullable: true })
    dailyLimit!: number | null;

    @ApiPropertyOptional({ nullable: true })
    monthlyLimit!: number | null;

    @ApiProperty()
    dailyUsed!: number;

    @ApiProperty()
    monthlyUsed!: number;

    @ApiPropertyOptional({ nullable: true })
    dailyRemaining!: number | null;

    @ApiPropertyOptional({ nullable: true })
    monthlyRemaining!: number | null;

    @ApiProperty({ type: Object })
    perAgentLimits!: Record<string, number>;

    @ApiPropertyOptional()
    dailyIntelligenceEnabled?: boolean;

    @ApiPropertyOptional({ type: [String] })
    notificationGroupIds?: string[];
}

export class UpdateQuotaRequestDto {
    @ApiPropertyOptional({ nullable: true })
    dailyLimit?: number | null;

    @ApiPropertyOptional({ nullable: true })
    monthlyLimit?: number | null;

    @ApiPropertyOptional({ type: Object })
    perAgentLimits?: Record<string, number>;

    @ApiPropertyOptional()
    enabled?: boolean;
}

export class UpdateRecommendationRequestDto {
    @ApiPropertyOptional({
        enum: [
            'NEW',
            'REVIEWING',
            'APPROVED',
            'REJECTED',
            'EXECUTING',
            'COMPLETED',
            'FAILED',
            'DISMISSED',
        ],
    })
    status?: string;

    @ApiPropertyOptional({ nullable: true })
    assigneeUserId?: string | null;

    @ApiPropertyOptional()
    acknowledge?: boolean;

    @ApiPropertyOptional({ nullable: true })
    dismissReason?: string | null;
}

export class AiRecommendationResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    agentType!: string;

    @ApiProperty()
    category!: string;

    @ApiProperty()
    title!: string;

    @ApiProperty()
    description!: string;

    @ApiProperty()
    severity!: string;

    @ApiProperty()
    priority!: string;

    @ApiProperty()
    status!: string;

    @ApiProperty()
    confidence!: number;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class CiDashboardResponseDto {
    @ApiProperty()
    score!: number;

    @ApiProperty({ type: Object })
    kpis!: Record<string, number>;

    @ApiProperty({ type: Object })
    usage!: Record<string, unknown>;

    @ApiProperty({ type: [AiRecommendationResponseDto] })
    recommendations!: AiRecommendationResponseDto[];

    @ApiPropertyOptional({ type: Object, nullable: true })
    latestDailyReport!: Record<string, unknown> | null;

    @ApiPropertyOptional()
    potentialSavings!: number;
}

export class DailySettingsRequestDto {
    @ApiPropertyOptional()
    dailyIntelligenceEnabled?: boolean;

    @ApiPropertyOptional({ type: [String], format: 'uuid' })
    notificationGroupIds?: string[];
}

export class DailySettingsResponseDto {
    @ApiProperty()
    dailyIntelligenceEnabled!: boolean;

    @ApiProperty({ type: [String] })
    notificationGroupIds!: string[];

    @ApiProperty({ enum: ['basic', 'professional', 'enterprise'] })
    tier!: string;
}

export class AiDailyReportResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty({ format: 'date' })
    reportDate!: string;

    @ApiProperty({ type: Object })
    summary!: Record<string, unknown> | string;

    @ApiProperty({ type: Object })
    findings!: Record<string, unknown>;

    @ApiProperty({ type: Object })
    recommendations!: Record<string, unknown>;

    @ApiProperty({ type: Object })
    metadata!: Record<string, unknown>;

    @ApiProperty()
    createdAt!: Date;
}

export class PrepareAutomationResponseDto {
    @ApiProperty({ type: AiRecommendationResponseDto })
    recommendation!: AiRecommendationResponseDto;

    @ApiProperty({ format: 'uuid' })
    automationId!: string;

    @ApiProperty()
    editorUrl!: string;
}

export class ExecuteRecommendationResponseDto {
    @ApiProperty({ type: AiRecommendationResponseDto })
    recommendation!: AiRecommendationResponseDto;

    @ApiProperty({ format: 'uuid' })
    executionId!: string;
}

export class UpsertKnowledgeRequestDto {
    @ApiPropertyOptional({ format: 'uuid' })
    id?: string;

    @ApiProperty({ maxLength: 300 })
    title!: string;

    @ApiProperty({ maxLength: 20000 })
    content!: string;

    @ApiPropertyOptional({ maxLength: 100 })
    source?: string;

    @ApiPropertyOptional({ enum: ['governance', 'finops', 'automation', 'general'] })
    domain?: 'governance' | 'finops' | 'automation' | 'general';

    @ApiPropertyOptional({ enum: ['guidance', 'rule', 'tags'] })
    role?: 'guidance' | 'rule' | 'tags';

    @ApiPropertyOptional({
        description:
            'Structured rule payload (required_tags for role=tags | finops_threshold | automation_playbook)',
    })
    rule?: Record<string, unknown>;
}

export class UpsertKnowledgeResponseDto {
    @ApiProperty()
    ok!: boolean;

    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty()
    semanticSearchEnabled!: boolean;

    @ApiPropertyOptional()
    warning?: string;
}
