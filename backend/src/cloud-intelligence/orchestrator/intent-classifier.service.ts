import { Injectable } from '@nestjs/common';
import { AiAgentType, type AiAgentTypeName } from '../agents/agent.interface';

export type IntentClassification = {
    agentType: AiAgentTypeName;
    confidence: number;
    reason: string;
};

const FINOPS_PATTERNS =
    /\b(finops|custos?|costs?|billing|or[cç]amentos?|budget|anomalia|anomaly|forecast|savings?|economia|desperd[ií]cio|waste|ri\b|reserved instance|savings plan|explique a anomalia|explain (the )?anomaly)\b/i;
const SECURITY_PATTERNS =
    /\b(seguran[cç]a|security|governan[cç]a|governance|compliance|finding|vulnerab|iam|bucket p[uú]blico|security group|criptografia|encryption|cr[ií]ticos? remedi[aá]veis|critical findings?)\b/i;
const DEVOPS_PATTERNS =
    /\b(lat[eê]ncia|latency|cpu|mem[oó]ria|memory|incidente|incident|alerta|alert|prometheus|grafana|logs?|sre|observab|kubernetes|eks|aks|ecs)\b/i;
const AUTOMATION_PATTERNS =
    /\b(automa[cç][aã]o|automation|crie (uma )?automa|create (an )?automation|desligar|ligar|schedule|workflow|cloudformation)\b/i;
const ARCHITECTURE_PATTERNS =
    /\b(arquitetura|architecture|diagrama|diagram|alta disponibilidade|high availability|desenhe|designe|proposta de arquitetura)\b/i;

@Injectable()
export class IntentClassifierService {
    classify(content: string): IntentClassification {
        const text = content.trim();

        const checks: Array<{ pattern: RegExp; agentType: AiAgentTypeName; reason: string }> = [
            { pattern: AUTOMATION_PATTERNS, agentType: AiAgentType.AUTOMATION_BUILDER, reason: 'automation_keywords' },
            { pattern: ARCHITECTURE_PATTERNS, agentType: AiAgentType.ARCHITECTURE_ADVISOR, reason: 'architecture_keywords' },
            { pattern: SECURITY_PATTERNS, agentType: AiAgentType.SECURITY_ANALYST, reason: 'security_keywords' },
            { pattern: FINOPS_PATTERNS, agentType: AiAgentType.FINOPS_ANALYST, reason: 'finops_keywords' },
            { pattern: DEVOPS_PATTERNS, agentType: AiAgentType.DEVOPS_ANALYST, reason: 'devops_keywords' },
        ];

        for (const check of checks) {
            if (check.pattern.test(text)) {
                return { agentType: check.agentType, confidence: 0.75, reason: check.reason };
            }
        }

        return {
            agentType: AiAgentType.CLOUD_ADVISOR,
            confidence: 0.9,
            reason: 'default_cloud_advisor',
        };
    }
}
