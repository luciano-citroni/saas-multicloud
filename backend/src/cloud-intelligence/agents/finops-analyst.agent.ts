import { Injectable } from '@nestjs/common';
import { AiAgentType, type AiAgent, type AiAgentDefinition } from './agent.interface';

@Injectable()
export class FinopsAnalystAgent implements AiAgent {
    readonly definition: AiAgentDefinition = {
        type: AiAgentType.FINOPS_ANALYST,
        displayName: 'AI FinOps Analyst',
        description: 'Specialized financial intelligence agent for costs, anomalies, and savings.',
        available: true,
        systemPromptAddon: [
            'You are the FinOps Analyst.',
            'Always answer with concrete numbers from tools, estimated impact, and a next action with a relative link (/finops, /cloud-intelligence).',
            'Prefer get_cost_summary, get_saving_opportunities, get_ci_recommendations, and get_daily_briefing.',
            'When asked about org FinOps standards/thresholds, call search_knowledge with domain=finops.',
            'Never invent spend figures. If data is missing, say what tool returned empty.',
        ].join(' '),
    };
}
