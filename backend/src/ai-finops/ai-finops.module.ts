import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TenantModule } from '../tenant/tenant.module';
import { RbacModule } from '../rbac/rbac.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailerModule } from '../mailer/mailer.module';
import { PlanModuleGuard } from '../common/guards/plan-module.guard';
import { Organization } from '../db/entites/organization.entity';
import { User } from '../db/entites/user.entity';
import { AiFinopsProvider } from '../db/entites/ai-finops-provider.entity';
import { AiFinopsConnection } from '../db/entites/ai-finops-connection.entity';
import { AiFinopsCredential } from '../db/entites/ai-finops-credential.entity';
import { AiFinopsTeam } from '../db/entites/ai-finops-team.entity';
import { AiFinopsTeamMember } from '../db/entites/ai-finops-team-member.entity';
import { AiFinopsModel } from '../db/entites/ai-finops-model.entity';
import { AiFinopsModelPricing } from '../db/entites/ai-finops-model-pricing.entity';
import { AiFinopsApplication } from '../db/entites/ai-finops-application.entity';
import { AiFinopsApiKey } from '../db/entites/ai-finops-api-key.entity';
import { AiFinopsUsageRecord } from '../db/entites/ai-finops-usage-record.entity';
import { AiFinopsUsageDaily } from '../db/entites/ai-finops-usage-daily.entity';
import { AiFinopsPolicy } from '../db/entites/ai-finops-policy.entity';
import { AiFinopsBudget } from '../db/entites/ai-finops-budget.entity';
import { AiFinopsProviderSync } from '../db/entites/ai-finops-provider-sync.entity';
import { AiFinopsAlert } from '../db/entites/ai-finops-alert.entity';
import { AiFinopsAuditLog } from '../db/entites/ai-finops-audit-log.entity';
import { AiFinopsRecommendation } from '../db/entites/ai-finops-recommendation.entity';
import { AiFinopsLicense } from '../db/entites/ai-finops-license.entity';
import { AiFinopsProviderUser } from '../db/entites/ai-finops-provider-user.entity';
import { AI_FINOPS_QUEUE } from './constants';
import { OpenAiFinopsAdapter } from './providers/openai.adapter';
import { BedrockFinopsAdapter } from './providers/bedrock.adapter';
import { AzureAiFoundryFinopsAdapter } from './providers/azure-ai-foundry.adapter';
import { AnthropicFinopsAdapter } from './providers/anthropic.adapter';
import { GeminiFinopsAdapter } from './providers/gemini.adapter';
import { MicrosoftCopilotFinopsAdapter } from './providers/microsoft-copilot.adapter';
import { DeepSeekFinopsAdapter } from './providers/deepseek.adapter';
import { GroqFinopsAdapter } from './providers/groq.adapter';
import { MistralFinopsAdapter } from './providers/mistral.adapter';
import { AiFinopsAdapterRegistry } from './providers/adapter.registry';
import { AiFinopsAuditService } from './services/ai-finops-audit.service';
import { AiFinopsProviderCatalogService } from './services/ai-finops-provider-catalog.service';
import { AiFinopsConnectionService } from './services/ai-finops-connection.service';
import { AiFinopsTeamService } from './services/ai-finops-team.service';
import { AiFinopsPricingService } from './services/ai-finops-pricing.service';
import { AiFinopsUsageService } from './services/ai-finops-usage.service';
import { AiFinopsPolicyService } from './services/ai-finops-policy.service';
import { AiFinopsBudgetService } from './services/ai-finops-budget.service';
import { AiFinopsApplicationService } from './services/ai-finops-application.service';
import { AiFinopsRecommendationService } from './services/ai-finops-recommendation.service';
import { AiFinopsSchedulerService } from './services/ai-finops-scheduler.service';
import { AiFinopsQuotaService } from './services/ai-finops-quota.service';
import { AiFinopsAlertDispatchService } from './services/ai-finops-alert-dispatch.service';
import { AiFinopsLicenseService } from './services/ai-finops-license.service';
import { AiFinopsProviderUserService } from './services/ai-finops-provider-user.service';
import { AiFinopsProcessor } from './processors/ai-finops.processor';
import { AiFinopsGovernanceController } from './controllers/ai-finops-governance.controller';
import { AiFinopsCostsController } from './controllers/ai-finops-costs.controller';
import { AiGatewayController } from './gateway/ai-gateway.controller';
import { AiGatewayService } from './gateway/ai-gateway.service';

@Module({
    imports: [
        BullModule.registerQueue({ name: AI_FINOPS_QUEUE }),
        TypeOrmModule.forFeature([
            Organization,
            User,
            AiFinopsProvider,
            AiFinopsConnection,
            AiFinopsCredential,
            AiFinopsTeam,
            AiFinopsTeamMember,
            AiFinopsModel,
            AiFinopsModelPricing,
            AiFinopsApplication,
            AiFinopsApiKey,
            AiFinopsUsageRecord,
            AiFinopsUsageDaily,
            AiFinopsPolicy,
            AiFinopsBudget,
            AiFinopsProviderSync,
            AiFinopsAlert,
            AiFinopsAuditLog,
            AiFinopsRecommendation,
            AiFinopsLicense,
            AiFinopsProviderUser,
        ]),
        TenantModule,
        RbacModule,
        BillingModule,
        NotificationsModule,
        MailerModule,
    ],
    controllers: [AiFinopsGovernanceController, AiFinopsCostsController, AiGatewayController],
    providers: [
        PlanModuleGuard,
        OpenAiFinopsAdapter,
        BedrockFinopsAdapter,
        AzureAiFoundryFinopsAdapter,
        AnthropicFinopsAdapter,
        GeminiFinopsAdapter,
        MicrosoftCopilotFinopsAdapter,
        DeepSeekFinopsAdapter,
        GroqFinopsAdapter,
        MistralFinopsAdapter,
        AiFinopsAdapterRegistry,
        AiFinopsAuditService,
        AiFinopsProviderCatalogService,
        AiFinopsConnectionService,
        AiFinopsTeamService,
        AiFinopsPricingService,
        AiFinopsUsageService,
        AiFinopsPolicyService,
        AiFinopsBudgetService,
        AiFinopsApplicationService,
        AiFinopsRecommendationService,
        AiFinopsSchedulerService,
        AiFinopsQuotaService,
        AiFinopsAlertDispatchService,
        AiFinopsLicenseService,
        AiFinopsProviderUserService,
        AiFinopsProcessor,
        AiGatewayService,
    ],
    exports: [
        AiFinopsConnectionService,
        AiFinopsUsageService,
        AiFinopsBudgetService,
        AiFinopsPolicyService,
        AiFinopsApplicationService,
        AiFinopsLicenseService,
        AiFinopsProviderUserService,
    ],
})
export class AiFinopsModule {}
