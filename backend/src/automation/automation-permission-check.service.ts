import { Injectable, Logger } from '@nestjs/common';
import {
    IAMClient,
    SimulatePrincipalPolicyCommand,
    type EvaluationResult,
} from '@aws-sdk/client-iam';
import { AwsConnectorService } from '../aws/aws-connector.service';
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
}

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

            const missing = items.filter((item) => item.decision !== 'allowed').map((item) => item.action);
            const uniqueMissing = [...new Set(missing)];
            const ok = uniqueMissing.length === 0;

            return {
                roleArn,
                simulated: true,
                ok,
                blocking: !ok,
                message: ok
                    ? 'A role possui permissões de criação e exclusão (rollback) para este fluxo.'
                    : `Faltam permissões IAM necessárias para criar recursos e/ou fazer rollback: ${uniqueMissing.join(', ')}`,
                createActions: create,
                rollbackActions: rollback,
                items,
                missing: uniqueMissing,
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
            };
        }
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
