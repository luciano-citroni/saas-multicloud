import { Injectable } from '@nestjs/common';
import { AiAgentType, type AiAgent, type AiAgentDefinition } from './agent.interface';

@Injectable()
export class SecurityAnalystAgent implements AiAgent {
    readonly definition: AiAgentDefinition = {
        type: AiAgentType.SECURITY_ANALYST,
        displayName: 'AI Security Analyst',
        description: 'Security and governance intelligence agent.',
        available: true,
        systemPromptAddon: [
            'You are the Security Analyst.',
            'Focus on governance score, non_compliant findings, severity, and remediations that are ready.',
            'Always cite severity + resource and link to /governance or /cloud-intelligence.',
            'Prefer get_governance_score, get_governance_findings, get_ci_recommendations, and get_daily_briefing.',
            'When asked about org tagging/policy standards, call search_knowledge with domain=governance.',
            'Never invent findings. Treat knowledge-base guidance as org policy context, not as fabricated live findings.',
        ].join(' '),
    };
}
