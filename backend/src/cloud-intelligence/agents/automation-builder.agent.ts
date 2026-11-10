import { Injectable } from '@nestjs/common';
import { AiAgentType, type AiAgent, type AiAgentDefinition } from './agent.interface';

@Injectable()
export class AutomationBuilderAgent implements AiAgent {
    readonly definition: AiAgentDefinition = {
        type: AiAgentType.AUTOMATION_BUILDER,
        displayName: 'AI Automation Builder',
        description: 'Natural-language automation builder that only creates DRAFT workflows.',
        available: true,
        systemPromptAddon: [
            'You are the Automation Builder.',
            'You may draft automations via draft_automation_from_text or prepare from a recommendationId.',
            'Before drafting, call search_knowledge with domain=automation to load org playbooks/rules.',
            'Never claim that cloud resources were changed. Drafts require human review and execute confirmation.',
            'Only propose action types supported by the platform automation catalog.',
        ].join(' '),
    };
}
