import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
    GetRolePolicyCommand,
    IAMClient,
    NoSuchEntityException,
    PutRolePolicyCommand,
    SimulatePrincipalPolicyCommand,
    type EvaluationResult,
} from '@aws-sdk/client-iam';
import { AwsConnectorService } from '../aws/aws-connector.service';
import { ErrorMessages } from '../common/messages/error-messages';
import { collectWorkflowIamActions } from './action-definitions';

export type PermissionDecision = 'allowed' | 'denied' | 'unknown';

export interface PermissionCheckItem {
    action: string;
    purpose: 'create' | 'rollback';
    decision: PermissionDecision;
    reason?: string;
}

export interface AutomationPermissionCheckResult {
    roleArn: string;
    simulated: boolean;
    ok: boolean;
    blocking: boolean;
    message: string | null;
    createActions: string[];
    rollbackActions: string[];
    items: PermissionCheckItem[];
    missing: string[];
    suggestedPolicy: Record<string, unknown> | null;
    canAttemptGrant: boolean;
}

export interface GrantMissingPermissionsResult {
    applied: boolean;
    roleArn: string;
    roleName: string;
    policyName: string;
    actionsGranted: string[];
    suggestedPolicy: Record<string, unknown>;
    check: AutomationPermissionCheckResult;
    message: string;
}

const AUTOMATION_GAP_POLICY_NAME = 'SaaSMultiCloudAutomationGap';

@Injectable()
export class AutomationPermissionCheckService {
    private readonly logger = new Logger(AutomationPermissionCheckService.name);

    constructor(private readonly connector: AwsConnectorService) {}

    async check(input: {
        tenantId: string;
        cloudAccountId: string;
        nodes: Array<{ type: string }>;
    }): Promise<AutomationPermissionCheckResult> {
        const { create, rollback, all } = collectWorkflowIamActions(input.nodes);
        const creds = await this.connector.resolveRoleCredentials(input.cloudAccountId, input.tenantId);
        const roleArn = creds.roleArn;

        if (all.length === 0) {
            return {
                roleArn,
                simulated: true,
                ok: true,
                blocking: false,
                message: 'Nenhuma ação IAM exigida por este fluxo.',
                createActions: create,
                rollbackActions: rollback,
                items: [],
                missing: [],
                suggestedPolicy: null,
                canAttemptGrant: false,
            };
        }

        try {
            const temporary = await this.connector.assumeRole(creds);
            const iam = new IAMClient({ region: creds.region, credentials: temporary });
            const evaluations = await this.simulateAll(iam, roleArn, all);
            const byAction = new Map(evaluations.map((item) => [item.EvalActionName ?? '', item]));

            const items: PermissionCheckItem[] = [];
            for (const action of create) {
                items.push(this.toItem(action, 'create', byAction.get(action)));
            }
            for (const action of rollback) {
                items.push(this.toItem(action, 'rollback', byAction.get(action)));
            }

            const missing = [...new Set(items.filter((item) => item.decision !== 'allowed').map((item) => item.action))];
            const ok = missing.length === 0;

            return {
                roleArn,
                simulated: true,
                ok,
                blocking: !ok,
                message: ok
                    ? 'A role possui permissões de criação e exclusão (rollback) para este fluxo.'
                    : `Faltam permissões IAM necessárias para criar recursos e/ou fazer rollback: ${missing.join(', ')}`,
                createActions: create,
                rollbackActions: rollback,
                items,
                missing,
                suggestedPolicy: ok ? null : this.buildSuggestedPolicy(missing),
                canAttemptGrant: !ok,
            };
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'erro desconhecido';
            this.logger.warn(`permission.check.failed role=${roleArn}: ${detail}`);
            const items: PermissionCheckItem[] = [
                ...create.map((action) => ({ action, purpose: 'create' as const, decision: 'unknown' as const, reason: detail })),
                ...rollback.map((action) => ({
                    action,
                    purpose: 'rollback' as const,
                    decision: 'unknown' as const,
                    reason: detail,
                })),
            ];
            return {
                roleArn,
                simulated: false,
                ok: false,
                blocking: true,
                message:
                    `Não foi possível simular as permissões da role (${detail}). ` +
                    'A role precisa permitir iam:SimulatePrincipalPolicy sobre si mesma, além das ações de criar e excluir os recursos do fluxo.',
                createActions: create,
                rollbackActions: rollback,
                items,
                missing: all,
                suggestedPolicy: this.buildSuggestedPolicy(all),
                canAttemptGrant: true,
            };
        }
    }

    async grantMissing(input: {
        tenantId: string;
        cloudAccountId: string;
        nodes: Array<{ type: string }>;
        actions?: string[];
    }): Promise<GrantMissingPermissionsResult> {
        const checkBefore = await this.check({
            tenantId: input.tenantId,
            cloudAccountId: input.cloudAccountId,
            nodes: input.nodes,
        });

        const requested = (input.actions?.length ? input.actions : checkBefore.missing)
            .map((action) => action.trim())
            .filter(Boolean);
        const uniqueActions = [...new Set(requested)];

        if (uniqueActions.length === 0) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.PERMISSION_GRANT_NOTHING_MISSING);
        }

        const creds = await this.connector.resolveRoleCredentials(input.cloudAccountId, input.tenantId);
        const roleArn = creds.roleArn;
        const roleName = this.roleNameFromArn(roleArn);
        const suggestedPolicy = this.buildSuggestedPolicy(uniqueActions);

        try {
            const temporary = await this.connector.assumeRole(creds);
            const iam = new IAMClient({ region: creds.region, credentials: temporary });
            const mergedActions = await this.mergeInlinePolicyActions(iam, roleName, uniqueActions);
            const policyDocument = this.buildSuggestedPolicy(mergedActions);

            await iam.send(
                new PutRolePolicyCommand({
                    RoleName: roleName,
                    PolicyName: AUTOMATION_GAP_POLICY_NAME,
                    PolicyDocument: JSON.stringify(policyDocument),
                }),
            );

            // IAM simulation can lag briefly after PutRolePolicy.
            await new Promise((resolve) => setTimeout(resolve, 1200));
            const check = await this.check({
                tenantId: input.tenantId,
                cloudAccountId: input.cloudAccountId,
                nodes: input.nodes,
            });

            return {
                applied: true,
                roleArn,
                roleName,
                policyName: AUTOMATION_GAP_POLICY_NAME,
                actionsGranted: uniqueActions,
                suggestedPolicy: policyDocument,
                check,
                message: check.ok
                    ? `Permissões aplicadas na role via inline policy "${AUTOMATION_GAP_POLICY_NAME}".`
                    : `Policy "${AUTOMATION_GAP_POLICY_NAME}" atualizada, mas ainda faltam permissões: ${check.missing.join(', ')}`,
            };
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'erro desconhecido';
            this.logger.warn(`permission.grant.failed role=${roleArn}: ${detail}`);
            throw new BadRequestException({
                message: ErrorMessages.AUTOMATION.PERMISSION_GRANT_FAILED,
                details: {
                    reason: detail,
                    roleArn,
                    roleName,
                    policyName: AUTOMATION_GAP_POLICY_NAME,
                    suggestedPolicy,
                    actions: uniqueActions,
                },
            });
        }
    }

    buildSuggestedPolicy(actions: string[]): Record<string, unknown> {
        const unique = [...new Set(actions.filter(Boolean))];
        return {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'SaaSMultiCloudAutomationGap',
                    Effect: 'Allow',
                    Action: unique,
                    Resource: '*',
                },
            ],
        };
    }

    private async mergeInlinePolicyActions(
        iam: IAMClient,
        roleName: string,
        actionsToAdd: string[],
    ): Promise<string[]> {
        const merged = new Set(actionsToAdd);
        try {
            const existing = await iam.send(
                new GetRolePolicyCommand({
                    RoleName: roleName,
                    PolicyName: AUTOMATION_GAP_POLICY_NAME,
                }),
            );
            if (existing.PolicyDocument) {
                const decoded = decodeURIComponent(existing.PolicyDocument);
                const parsed = JSON.parse(decoded) as {
                    Statement?: Array<{ Action?: string | string[] }>;
                };
                for (const statement of parsed.Statement ?? []) {
                    const action = statement.Action;
                    if (typeof action === 'string') merged.add(action);
                    else if (Array.isArray(action)) for (const item of action) merged.add(item);
                }
            }
        } catch (error) {
            if (!(error instanceof NoSuchEntityException)) {
                // Older SDKs may not throw typed NoSuchEntityException; treat "NoSuchEntity" as empty.
                const message = error instanceof Error ? error.message : '';
                if (!message.includes('NoSuchEntity') && !message.includes('cannot be found')) {
                    throw error;
                }
            }
        }
        return [...merged].sort();
    }

    private roleNameFromArn(roleArn: string): string {
        const parts = roleArn.split('/');
        const roleName = parts[parts.length - 1];
        if (!roleName) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.PERMISSION_GRANT_FAILED);
        }
        return roleName;
    }

    private async simulateAll(
        iam: IAMClient,
        roleArn: string,
        actions: string[],
    ): Promise<EvaluationResult[]> {
        const results: EvaluationResult[] = [];
        const chunkSize = 100;
        for (let index = 0; index < actions.length; index += chunkSize) {
            const chunk = actions.slice(index, index + chunkSize);
            const response = await iam.send(
                new SimulatePrincipalPolicyCommand({
                    PolicySourceArn: roleArn,
                    ActionNames: chunk,
                    ResourceArns: ['*'],
                }),
            );
            results.push(...(response.EvaluationResults ?? []));
        }
        return results;
    }

    private toItem(
        action: string,
        purpose: 'create' | 'rollback',
        evaluation: EvaluationResult | undefined,
    ): PermissionCheckItem {
        if (!evaluation) {
            return { action, purpose, decision: 'unknown', reason: 'Sem resultado da simulação' };
        }
        const decision = evaluation.EvalDecision?.toLowerCase();
        if (decision === 'allowed') {
            return { action, purpose, decision: 'allowed' };
        }
        return {
            action,
            purpose,
            decision: 'denied',
            reason: evaluation.EvalDecisionDetails
                ? JSON.stringify(evaluation.EvalDecisionDetails)
                : evaluation.EvalDecision,
        };
    }
}
