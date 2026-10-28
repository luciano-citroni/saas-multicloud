import { Injectable } from '@nestjs/common';
import { AUTOMATION_ACTION_TYPES } from './constants';
import { getActionDefinition, getRollbackIamActions } from './action-definitions';
import { CostEstimatorService } from './cost-estimator.service';
import { CloudFormationAutomationService } from './cloudformation-automation.service';
import { AutomationTemplateService } from './automation-template.service';
import { buildStackName, hasRuntimeOutputBinding, redactSensitive, sensitiveVariableNames } from './bindings';
import { DependencyResolver } from './workflow/dependency-resolver';
import { OutputResolver } from './workflow/output-resolver';
import type { EmbeddedWorkflowTemplate, WorkflowSnapshot } from './workflow/workflow.types';
import type { FlowNodeDto } from './dto';
import { estimateStackMonthlyCost } from './stack-cost';
import { extractTemplateDocument } from './template-document';
import type { PreparedChangeSet } from './workflow/automation-node-runner';

export interface AutomationPlanStep {
    nodeId: string;
    name: string;
    type: string;
    region: string | null;
    dependencies: string[];
    iamActions: string[];
    declaredResources: Array<{ logicalId: string; type: string }>;
    existingReferences: Array<{ resourceType?: string; resourceId?: string }>;
    parameters: Record<string, unknown>;
    estimatedCost: number | null;
    warnings: string[];
    changeSet: { deferred: true; reason: string } | { deferred: false; stackName: string; changeSetName: string; status?: string; changes: unknown[] };
}

export interface AutomationPlan {
    cloudAccountId: string;
    steps: AutomationPlanStep[];
    limitations: string[];
    blocking: boolean;
    changeSets: PreparedChangeSet[];
}

@Injectable()
export class AutomationPlanService {
    constructor(
        private readonly dependencyResolver: DependencyResolver,
        private readonly templates: AutomationTemplateService,
        private readonly cloudFormation: CloudFormationAutomationService,
        private readonly costEstimator: CostEstimatorService,
        private readonly outputResolver: OutputResolver,
    ) {}

    async build(input: {
        tenantId: string;
        automationId: string;
        cloudAccountId: string;
        snapshot: WorkflowSnapshot;
        createChangeSets: boolean;
    }): Promise<AutomationPlan> {
        const batches = this.dependencyResolver.resolveBatches(input.snapshot);
        const embedded = input.snapshot.templates ?? (await this.templates.embedForNodes(input.tenantId, input.snapshot.nodes));
        const sensitive = sensitiveVariableNames(input.snapshot.variables);
        const steps: AutomationPlanStep[] = [];
        const changeSets: PreparedChangeSet[] = [];
        let blocking = false;

        for (const batch of batches) {
            for (const nodeId of batch) {
                const node = input.snapshot.nodes.find((item) => item.id === nodeId);
                if (!node) continue;
                const definition = getActionDefinition(node.type);
                const dependencies = input.snapshot.edges.filter((edge) => edge.targetNodeId === nodeId).map((edge) => edge.sourceNodeId);
                const warnings: string[] = ['A validação estática e o change set não garantem que a execução terá sucesso.'];
                let estimatedCost: number | null = null;
                if (node.type === AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE) {
                    estimatedCost = this.costEstimator.estimateNode({ id: node.id, type: 's3', config: { region: 'us-east-1' } } as FlowNodeDto).onDemand;
                }

                const step: AutomationPlanStep = {
                    nodeId,
                    name: node.name,
                    type: node.type,
                    region: typeof node.config.region === 'string' ? node.config.region : null,
                    dependencies,
                    iamActions: [
                        ...(definition?.requiredIamActions ?? []),
                        ...getRollbackIamActions(node.type),
                    ],
                    declaredResources: [],
                    existingReferences: [],
                    parameters: {},
                    estimatedCost,
                    warnings,
                    changeSet: { deferred: true, reason: 'Este bloco não abre change set.' },
                };

                if (node.type === AUTOMATION_ACTION_TYPES.AWS_EXISTING_RESOURCE) {
                    step.existingReferences = [{ resourceType: String(node.config.resourceType), resourceId: String(node.config.resourceId) }];
                    step.warnings.push('Referenciar um recurso existente não faz o CloudFormation passar a gerenciá-lo.');
                }

                if (node.type === AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK) {
                    const template = embedded[`${node.config.templateId}:${node.config.templateVersion}`];
                    if (!template) {
                        step.warnings.push('Template não encontrado para este bloco.');
                        blocking = true;
                    } else {
                        this.fillStackStep(step, node.config, template, sensitive);
                        const deferred = hasRuntimeOutputBinding(node.config.parameters) || this.missingRequired(input.snapshot, node.config.parameters);
                        let changeSetParameters = (node.config.parameters as Record<string, unknown>) ?? {};
                        let parametersForCost = this.costParameters(template, node.config);
                        if (!deferred) {
                            try {
                                const resolved = this.outputResolver.resolveConfig(node.config, new Map(), this.variableDefaults(input.snapshot));
                                changeSetParameters = (resolved.parameters as Record<string, unknown>) ?? {};
                                parametersForCost = this.costParameters(template, node.config, changeSetParameters);
                            } catch (error) {
                                blocking = true;
                                step.warnings.push(error instanceof Error ? error.message : 'Parâmetros não resolvidos.');
                                steps.push(step);
                                continue;
                            }
                        }
                        step.estimatedCost = estimateStackMonthlyCost(template.resources, parametersForCost);
                        const inspected = extractTemplateDocument(template.content);
                        if (inspected.conditions.length) step.warnings.push(`Condições do template: ${inspected.conditions.join(', ')}.`);
                        if (inspected.mappings.length) step.warnings.push(`Mapeamentos do template: ${inspected.mappings.join(', ')}.`);
                        if (deferred) {
                            step.changeSet = { deferred: true, reason: 'Parâmetros dependem de saídas ou variáveis resolvidas na execução.' };
                        } else if (input.createChangeSets && step.region) {
                            const stackName = buildStackName(String(node.config.stackName), input.automationId);
                            const changeSetName = `plan-${node.id.replace(/-/g, '').slice(0, 12)}`;
                            try {
                                await this.cloudFormation.validateTemplate(input.cloudAccountId, input.tenantId, step.region, template.content);
                                const opened = await this.cloudFormation.openChangeSet({
                                    cloudAccountId: input.cloudAccountId,
                                    organizationId: input.tenantId,
                                    region: step.region,
                                    stackName,
                                    changeSetName,
                                    templateBody: template.content,
                                    parameters: changeSetParameters,
                                    capabilities: template.capabilities,
                                });
                                step.changeSet = { deferred: false, stackName, changeSetName, status: opened.status, changes: opened.changes };
                                changeSets.push({ nodeId: node.id, region: step.region, stackName, changeSetName });
                                if (opened.changes.some((change) => change.action === 'Remove' || change.replacement === 'True')) {
                                    step.warnings.push('O change set pode substituir ou remover recursos. Stacks criadas nesta execução são apagadas se uma etapa posterior falhar.');
                                }
                            } catch (error) {
                                blocking = true;
                                step.warnings.push(error instanceof Error ? error.message : 'Falha ao preparar o change set.');
                            }
                        }
                    }
                }

                steps.push(step);
            }
        }

        return {
            cloudAccountId: input.cloudAccountId,
            steps,
            limitations: [
                'Templates são enviados apenas como TemplateBody armazenado no SaaS.',
                'O custo de ECS usa a tabela pública de Fargate e do ALB na região de referência us-east-1, sem LCU.',
                'Uma etapa que falha apaga as stacks criadas nesta execução. Uma stack que já existia e só foi atualizada permanece.',
                'Falha ao gravar um recurso no inventário não apaga uma stack que já concluiu.',
            ],
            blocking,
            changeSets,
        };
    }

    private fillStackStep(
        step: AutomationPlanStep,
        config: Record<string, unknown>,
        template: EmbeddedWorkflowTemplate,
        sensitive: Set<string>,
    ) {
        step.declaredResources = template.resources;
        step.parameters = redactSensitive((config.parameters as Record<string, unknown>) ?? {}, new Set([...sensitive, ...template.parameters.filter((item) => item.noEcho).map((item) => item.name)])) as Record<string, unknown>;
        if (template.capabilities.length) {
            step.warnings.push(`Capabilities exigidas: ${template.capabilities.join(', ')}.`);
            step.iamActions = [...step.iamActions, ...template.capabilities];
        }
    }

    private costParameters(
        template: EmbeddedWorkflowTemplate,
        config: Record<string, unknown>,
        resolved?: Record<string, unknown>,
    ): Record<string, unknown> {
        const configured = (config.parameters as Record<string, unknown> | undefined) ?? {};
        const output: Record<string, unknown> = {};
        for (const parameter of template.parameters) {
            const value = resolved?.[parameter.name] ?? configured[parameter.name] ?? parameter.default;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[parameter.name] = value;
        }
        return output;
    }

    private missingRequired(snapshot: WorkflowSnapshot, parameters: unknown): boolean {
        if (!parameters || typeof parameters !== 'object') return false;
        for (const value of Object.values(parameters as Record<string, unknown>)) {
            if (value && typeof value === 'object' && (value as { type?: string }).type === 'VARIABLE') {
                const name = String((value as { name?: string }).name ?? '');
                const variable = snapshot.variables?.[name];
                if (!variable || (variable.required && variable.default === undefined)) return true;
            }
        }
        return false;
    }

    private variableDefaults(snapshot: WorkflowSnapshot): Record<string, unknown> {
        const values: Record<string, unknown> = {};
        for (const [name, variable] of Object.entries(snapshot.variables ?? {})) {
            if (variable.default !== undefined) values[name] = variable.default;
        }
        return values;
    }
}
