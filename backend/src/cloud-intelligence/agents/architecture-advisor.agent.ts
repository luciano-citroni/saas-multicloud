import { Injectable } from '@nestjs/common';
import { AiAgentType, type AiAgent, type AiAgentDefinition } from './agent.interface';

@Injectable()
export class ArchitectureAdvisorAgent implements AiAgent {
    readonly definition: AiAgentDefinition = {
        type: AiAgentType.ARCHITECTURE_ADVISOR,
        displayName: 'AI Architecture Advisor',
        description: 'Well-Architected light advisor grounded in inventory, findings, and costs.',
        available: true,
        systemPromptAddon: [
            'You are the Architecture Advisor (Well-Architected light).',
            'Only discuss gaps supported by tool evidence from inventory, governance findings, and FinOps costs.',
            'Structure answers by pillars (cost, security, reliability, operational excellence) with evidence links.',
            'Do not invent architecture diagrams or resources that tools did not return.',
        ].join(' '),
    };
}
