import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiChatAuditEvent } from '../db/entites/ai-chat-audit-event.entity';
import { AiChatConversation } from '../db/entites/ai-chat-conversation.entity';
import { AiChatMessage } from '../db/entites/ai-chat-message.entity';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { CloudModule } from '../cloud/cloud.module';
import { FinopsModule } from '../finops/finops.module';
import { GovernanceModule } from '../governance/governance.module';
import { AutomationModule } from '../automation/automation.module';
import { BillingModule } from '../billing/billing.module';
import { AwsAssessmentModule } from '../aws/assessment/aws-assessment.module';
import { AzureAssessmentModule } from '../azure/assessment/azure-assessment.module';
import { GcpAssessmentModule } from '../gcp/assessment/gcp-assessment.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { ChatAuditService } from './chat-audit.service';
import { ChatHistoryService } from './chat-history.service';
import { ChatScopeService } from './chat-scope.service';
import { ChatToolService } from './chat-tool.service';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
    imports: [
        TypeOrmModule.forFeature([AiChatConversation, AiChatMessage, AiChatAuditEvent]),
        TenantModule,
        RbacModule,
        CloudModule,
        FinopsModule,
        GovernanceModule,
        AutomationModule,
        BillingModule,
        AwsAssessmentModule,
        AzureAssessmentModule,
        GcpAssessmentModule,
    ],
    controllers: [AiChatController],
    providers: [
        AiChatService,
        ChatHistoryService,
        ChatScopeService,
        ChatToolService,
        ChatAuditService,
        OpenAiProvider,
    ],
    exports: [AiChatService],
})
export class AiChatModule {}
