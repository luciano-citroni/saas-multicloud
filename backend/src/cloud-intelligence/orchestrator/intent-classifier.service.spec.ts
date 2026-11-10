import { AiAgentType } from '../agents/agent.interface';
import { IntentClassifierService } from './intent-classifier.service';

describe('IntentClassifierService', () => {
    const service = new IntentClassifierService();

    it('routes cost questions to FinOps analyst', () => {
        expect(service.classify('Qual conta teve o maior aumento de custos?').agentType).toBe(
            AiAgentType.FINOPS_ANALYST,
        );
    });

    it('routes security questions to Security analyst', () => {
        expect(service.classify('Existem buckets públicos ou security groups expostos?').agentType).toBe(
            AiAgentType.SECURITY_ANALYST,
        );
    });

    it('routes automation requests to Automation builder', () => {
        expect(service.classify('Crie uma automação para desligar EC2 às 20h').agentType).toBe(
            AiAgentType.AUTOMATION_BUILDER,
        );
    });

    it('defaults to Cloud Advisor', () => {
        expect(service.classify('Quantos recursos tenho na AWS?').agentType).toBe(AiAgentType.CLOUD_ADVISOR);
    });
});
