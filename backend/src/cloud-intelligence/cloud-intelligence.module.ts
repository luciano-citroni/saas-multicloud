import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationModule } from '../automation/automation.module';
import { AwsAssessmentModule } from '../aws/assessment/aws-assessment.module';
import { AzureAssessmentModule } from '../azure/assessment/azure-assessment.module';
import { BillingModule } from '../billing/billing.module';
import { CloudModule } from '../cloud/cloud.module';
import { AiChatAuditEvent } from '../db/entites/ai-chat-audit-event.entity';
import { AiChatConversation } from '../db/entites/ai-chat-conversation.entity';
import { AiChatMessage } from '../db/entites/ai-chat-message.entity';
import { AiDailyReport } from '../db/entites/ai-daily-report.entity';
import { AiKnowledgeChunk } from '../db/entites/ai-knowledge-chunk.entity';
import { AiOrgQuota } from '../db/entites/ai-org-quota.entity';
import { AiRecommendation } from '../db/entites/ai-recommendation.entity';
import { AiUsageRecord } from '../db/entites/ai-usage-record.entity';
import { AwsEc2Instance } from '../db/entites/aws-ec2.entity';
import { FinopsCostAnomaly } from '../db/entites/finops-cost-anomaly.entity';
import { FinopsRecommendation } from '../db/entites/finops-recommendation.entity';
import { GovernanceFinding } from '../db/entites/governance-finding.entity';
import { FinopsModule } from '../finops/finops.module';
import { GcpAssessmentModule } from '../gcp/assessment/gcp-assessment.module';
import { GovernanceModule } from '../governance/governance.module';
import { MailerModule } from '../mailer/mailer.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { TenantModule } from '../tenant/tenant.module';
import { AgentRegistry } from './agents/agent.registry';
import { ArchitectureAdvisorAgent } from './agents/architecture-advisor.agent';
import { AutomationBuilderAgent } from './agents/automation-builder.agent';
import { CloudAdvisorAgent } from './agents/cloud-advisor.agent';
import { FinopsAnalystAgent } from './agents/finops-analyst.agent';
import { SecurityAnalystAgent } from './agents/security-analyst.agent';
import { AiChatCompatController } from './ai-chat.compat.controller';
import { AiAuditService } from './audit/ai-audit.service';
import { CloudIntelligenceController } from './cloud-intelligence.controller';
import { CLOUD_INTELLIGENCE_DAILY_QUEUE } from './constants';
import { CloudIntelligenceDashboardService } from './dashboard/dashboard.service';
import { DailyBriefingComposer } from './daily-intelligence/daily-briefing.composer';
import { DailyIntelligenceProcessor } from './daily-intelligence/daily-intelligence.processor';
import { DailyIntelligenceScheduler } from './daily-intelligence/daily-intelligence.scheduler';
import { DailyIntelligenceService } from './daily-intelligence/daily-intelligence.service';
import { ConversationService } from './history/conversation.service';
import { KnowledgeBaseService } from './knowledge/knowledge-base.service';
import { AiOrchestratorService } from './orchestrator/ai-orchestrator.service';
import { ContextBuilderService } from './orchestrator/context-builder.service';
import { IntentClassifierService } from './orchestrator/intent-classifier.service';
import { AiProviderFactory } from './providers/ai-provider.factory';
import { OpenAiProvider } from './providers/openai.provider';
import { RecommendationAutomationService } from './recommendations/recommendation-automation.service';
import { RecommendationsService } from './recommendations/recommendations.service';
import { AiRoiScheduler } from './roi/ai-roi.scheduler';
import { AiRoiService } from './roi/ai-roi.service';
import { AiToolRegistry } from './tools/ai-tool.registry';
import { AiQuotasService } from './usage/ai-quotas.service';
import { AiUsageService } from './usage/ai-usage.service';
import { AiRoiSnapshot } from '../db/entites/ai-roi-snapshot.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            AiChatConversation,
            AiChatMessage,
            AiChatAuditEvent,
            AiUsageRecord,
            AiOrgQuota,
            AiRecommendation,
            AiDailyReport,
            AiKnowledgeChunk,
            AiRoiSnapshot,
            FinopsCostAnomaly,
            FinopsRecommendation,
            GovernanceFinding,
            AwsEc2Instance,
        ]),
        BullModule.registerQueue({ name: CLOUD_INTELLIGENCE_DAILY_QUEUE }),
        TenantModule,
        RbacModule,
        CloudModule,
        FinopsModule,
        GovernanceModule,
        AutomationModule,
        BillingModule,
        NotificationsModule,
        MailerModule,
        AwsAssessmentModule,
        AzureAssessmentModule,
        GcpAssessmentModule,
    ],
    controllers: [CloudIntelligenceController, AiChatCompatController],
    providers: [
        ConversationService,
        ContextBuilderService,
        KnowledgeBaseService,
        AiToolRegistry,
        AiAuditService,
        OpenAiProvider,
        AiProviderFactory,
        IntentClassifierService,
        CloudAdvisorAgent,
        FinopsAnalystAgent,
        SecurityAnalystAgent,
        AutomationBuilderAgent,
        ArchitectureAdvisorAgent,
        AgentRegistry,
        AiUsageService,
        AiQuotasService,
        RecommendationsService,
        RecommendationAutomationService,
        CloudIntelligenceDashboardService,
        DailyBriefingComposer,
        DailyIntelligenceService,
        DailyIntelligenceScheduler,
        DailyIntelligenceProcessor,
        AiRoiService,
        AiRoiScheduler,
        AiOrchestratorService,
    ],
    exports: [
        AiOrchestratorService,
        AiUsageService,
        AiQuotasService,
        RecommendationsService,
        AiProviderFactory,
        DailyIntelligenceService,
        KnowledgeBaseService,
        AiRoiService,
    ],
})
export class CloudIntelligenceModule {}
