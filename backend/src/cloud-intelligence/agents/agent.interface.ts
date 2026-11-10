export const AiAgentType = {
    CLOUD_ADVISOR: 'cloud_advisor',
    FINOPS_ANALYST: 'finops_analyst',
    SECURITY_ANALYST: 'security_analyst',
    DEVOPS_ANALYST: 'devops_analyst',
    AUTOMATION_BUILDER: 'automation_builder',
    ARCHITECTURE_ADVISOR: 'architecture_advisor',
} as const;

export type AiAgentTypeName = (typeof AiAgentType)[keyof typeof AiAgentType];

export type AiAgentDefinition = {
    type: AiAgentTypeName;
    displayName: string;
    description: string;
    /** When false, orchestrator returns AGENT_UNAVAILABLE. */
    available: boolean;
    systemPromptAddon?: string;
};

export interface AiAgent {
    readonly definition: AiAgentDefinition;
}
