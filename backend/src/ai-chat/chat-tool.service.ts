import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { CloudService } from '../cloud/cloud.service';
import { FinopsOrgOverviewService } from '../finops/services/finops-org-overview.service';
import { GovernanceService } from '../governance/services/governance.service';
import { AutomationsCrudService } from '../automation/automations-crud.service';
import { AutomationService } from '../automation/automation.service';
import { BillingService } from '../billing/billing.service';
import { SystemModule, normalizePlanModules, ALL_MODULES_TOKEN } from '../common/modules/system-modules';
import { ErrorMessages } from '../common/messages/error-messages';
import { AwsAssessmentReportService } from '../aws/assessment/aws-assessment-report.service';
import { AwsAssessmentService } from '../aws/assessment/aws-assessment.service';
import { AzureAssessmentReportService } from '../azure/assessment/azure-assessment-report.service';
import { AzureAssessmentService } from '../azure/assessment/azure-assessment.service';
import { GcpAssessmentReportService } from '../gcp/assessment/gcp-assessment-report.service';
import { GcpAssessmentService } from '../gcp/assessment/gcp-assessment.service';
import { getSaasDocsByTopic } from './docs/saas-docs';
import type { AiChatToolDefinition } from './providers/ai-provider.interface';
import type { AiChatSource } from '../db/entites/ai-chat-message.entity';
import { ChatAuditService } from './chat-audit.service';

export type ToolSecurityContext = {
    organizationId: string;
    userId: string;
    enabledModules: Set<string>;
};

export type ToolExecutionResult = {
    content: string;
    sources: AiChatSource[];
};

type ToolHandler = (args: Record<string, unknown>, ctx: ToolSecurityContext) => Promise<ToolExecutionResult>;

type RegisteredTool = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    requiredModules: string[];
    schema: z.ZodTypeAny;
    handler: ToolHandler;
};

const MAX_ACCOUNTS_FANOUT = 8;

function wrapUntrusted(payload: unknown): string {
    return `<UNTRUSTED_DATA>\n${JSON.stringify(payload)}\n</UNTRUSTED_DATA>`;
}

function source(partial: AiChatSource): AiChatSource {
    return partial;
}

function docsHref(topic?: string): string | undefined {
    switch (topic) {
        case 'finops':
            return '/finops';
        case 'assessment':
            return '/assessment';
        case 'governance':
            return '/governance';
        case 'automation':
            return '/automations';
        case 'cloud_accounts':
        case 'cloud_inventory':
            return '/cloud-accounts';
        case 'onboarding':
            return '/cloud-accounts/new';
        case 'overview':
            return '/';
        default:
            return undefined;
    }
}

@Injectable()
export class ChatToolService {
    private readonly logger = new Logger(ChatToolService.name);
    private readonly tools: RegisteredTool[];

    constructor(
        private readonly cloudService: CloudService,
        private readonly finopsOrgOverviewService: FinopsOrgOverviewService,
        private readonly governanceService: GovernanceService,
        private readonly automationsCrudService: AutomationsCrudService,
        private readonly automationService: AutomationService,
        private readonly billingService: BillingService,
        private readonly awsAssessmentReportService: AwsAssessmentReportService,
        private readonly awsAssessmentService: AwsAssessmentService,
        private readonly azureAssessmentReportService: AzureAssessmentReportService,
        private readonly azureAssessmentService: AzureAssessmentService,
        private readonly gcpAssessmentReportService: GcpAssessmentReportService,
        private readonly gcpAssessmentService: GcpAssessmentService,
        private readonly auditService: ChatAuditService,
    ) {
        this.tools = this.buildTools();
    }

    async resolveEnabledModules(organizationId: string): Promise<Set<string>> {
        try {
            const plan = await this.billingService.getActivePlanForOrganization(organizationId);
            const modules = normalizePlanModules(plan.metadata.modules);
            if (modules.includes(ALL_MODULES_TOKEN)) {
                return new Set([
                    SystemModule.FINOPS,
                    SystemModule.CLOUD_INVENTORY,
                    SystemModule.ASSESSMENT,
                    SystemModule.GOVERNANCE,
                    SystemModule.AUTOMATION,
                ]);
            }
            return new Set(modules);
        } catch {
            return new Set();
        }
    }

    listToolsForContext(enabledModules: Set<string>): AiChatToolDefinition[] {
        return this.tools
            .filter((tool) => {
                if (tool.requiredModules.length === 0) {
                    return true;
                }
                return tool.requiredModules.some((moduleName) => enabledModules.has(moduleName));
            })
            .map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            }));
    }

    hasTool(name: string): boolean {
        return this.tools.some((tool) => tool.name === name);
    }

    async executeTool(
        name: string,
        rawArgs: Record<string, unknown>,
        ctx: ToolSecurityContext,
    ): Promise<ToolExecutionResult> {
        const tool = this.tools.find((item) => item.name === name);
        if (!tool) {
            throw new BadRequestException(`Unknown tool: ${name}`);
        }

        if (tool.requiredModules.length > 0) {
            const allowed = tool.requiredModules.some((moduleName) => ctx.enabledModules.has(moduleName));
            if (!allowed) {
                throw new ForbiddenException(ErrorMessages.PLANS.MODULE_NOT_ENABLED);
            }
        }

        // Strip any client/model-supplied tenant identifiers — backend context wins.
        const { organizationId: _ignoredOrg, tenantId: _ignoredTenant, userId: _ignoredUser, ...safeArgs } = rawArgs as Record<
            string,
            unknown
        > & { organizationId?: unknown; tenantId?: unknown; userId?: unknown };

        const parsed = tool.schema.safeParse(safeArgs);
        if (!parsed.success) {
            throw new BadRequestException(ErrorMessages.GENERAL.BAD_REQUEST);
        }

        const started = Date.now();
        try {
            const result = await tool.handler(parsed.data as Record<string, unknown>, ctx);
            await this.auditService.record({
                organizationId: ctx.organizationId,
                actorId: ctx.userId,
                action: 'tool_executed',
                entityType: 'ai_chat_tool',
                metadata: { tool: name, latencyMs: Date.now() - started, ok: true },
            });
            return result;
        } catch (error) {
            await this.auditService.record({
                organizationId: ctx.organizationId,
                actorId: ctx.userId,
                action: 'tool_executed',
                entityType: 'ai_chat_tool',
                metadata: {
                    tool: name,
                    latencyMs: Date.now() - started,
                    ok: false,
                    error: error instanceof Error ? error.message : 'unknown',
                },
            });
            throw error;
        }
    }

    private async requireCloudAccount(cloudAccountId: string, organizationId: string) {
        const account = await this.cloudService.findByIdAndTenant(cloudAccountId, organizationId, false);
        if (!account) {
            throw new NotFoundException(ErrorMessages.CLOUD_ACCOUNTS.NOT_FOUND);
        }
        return account;
    }

    private async listAuthorizedAccounts(organizationId: string) {
        const accounts = await this.cloudService.findByOrganization(organizationId, { isActive: 'true' });
        return accounts.slice(0, MAX_ACCOUNTS_FANOUT);
    }

    private buildTools(): RegisteredTool[] {
        return [
            {
                name: 'get_cloud_accounts',
                description: 'List cloud accounts authorized for the active organization.',
                requiredModules: [],
                parameters: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Optional alias filter' },
                        isActive: { type: 'boolean' },
                    },
                },
                schema: z.object({
                    name: z.string().max(100).optional(),
                    isActive: z.boolean().optional(),
                }),
                handler: async (args, ctx) => {
                    const accounts = await this.cloudService.findByOrganization(ctx.organizationId, {
                        name: typeof args.name === 'string' ? args.name : undefined,
                        isActive:
                            typeof args.isActive === 'boolean' ? (args.isActive ? 'true' : 'false') : undefined,
                    });
                    const safe = accounts.map((account) => ({
                        id: account.id,
                        alias: account.alias,
                        provider: account.provider,
                        isActive: account.isActive,
                        lastGeneralSyncAt: account.lastGeneralSyncAt,
                        isSyncInProgress: account.isSyncInProgress,
                    }));
                    return {
                        content: wrapUntrusted({ accounts: safe, count: safe.length }),
                        sources: [
                            source({
                                module: 'cloud',
                                label: 'Cloud Accounts',
                                detail: `${safe.length} contas`,
                                href: '/cloud-accounts',
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_cost_summary',
                description:
                    'Get FinOps cost summary for the whole organization by default, or a specific cloud account when cloudAccountId is provided.',
                requiredModules: [SystemModule.FINOPS],
                parameters: {
                    type: 'object',
                    properties: {
                        period: {
                            type: 'string',
                            enum: ['last7days', 'last30days', 'last90days', 'currentmonth', 'lastmonth', 'ytd'],
                        },
                        year: { type: 'string' },
                        month: { type: 'string' },
                        cloudAccountId: { type: 'string', format: 'uuid' },
                    },
                },
                schema: z.object({
                    period: z.enum(['last7days', 'last30days', 'last90days', 'currentmonth', 'lastmonth', 'ytd']).optional(),
                    year: z.string().optional(),
                    month: z.string().optional(),
                    cloudAccountId: z.string().uuid().optional(),
                }),
                handler: async (args, ctx) => {
                    if (typeof args.cloudAccountId === 'string') {
                        await this.requireCloudAccount(args.cloudAccountId, ctx.organizationId);
                    }
                    const overview = await this.finopsOrgOverviewService.getOverview(ctx.organizationId, {
                        period: typeof args.period === 'string' ? args.period : undefined,
                        year: typeof args.year === 'string' ? args.year : undefined,
                        month: typeof args.month === 'string' ? args.month : undefined,
                        cloudAccountId: typeof args.cloudAccountId === 'string' ? args.cloudAccountId : undefined,
                    });
                    const accountId = typeof args.cloudAccountId === 'string' ? args.cloudAccountId : undefined;
                    const period = typeof args.period === 'string' ? args.period : 'default period';
                    const href = accountId
                        ? `/finops/accounts/${accountId}?period=${encodeURIComponent(typeof args.period === 'string' ? args.period : 'currentmonth')}`
                        : `/finops${typeof args.period === 'string' ? `?period=${encodeURIComponent(args.period)}` : ''}`;
                    return {
                        content: wrapUntrusted(overview),
                        sources: [
                            source({
                                module: 'finops',
                                label: 'FinOps Overview',
                                detail: period,
                                href,
                                cloudAccountId: accountId,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'compare_cloud_costs',
                description: 'Compare cloud costs across all providers and accounts for the organization.',
                requiredModules: [SystemModule.FINOPS],
                parameters: {
                    type: 'object',
                    properties: {
                        period: {
                            type: 'string',
                            enum: ['last7days', 'last30days', 'last90days', 'currentmonth', 'lastmonth', 'ytd'],
                        },
                    },
                },
                schema: z.object({
                    period: z.enum(['last7days', 'last30days', 'last90days', 'currentmonth', 'lastmonth', 'ytd']).optional(),
                }),
                handler: async (args, ctx) => {
                    const overview = await this.finopsOrgOverviewService.getOverview(ctx.organizationId, {
                        period: typeof args.period === 'string' ? args.period : 'last30days',
                    });
                    const byProvider: Record<string, number> = {};
                    for (const account of overview.accounts ?? []) {
                        const provider = String(account.provider ?? 'unknown');
                        byProvider[provider] = (byProvider[provider] ?? 0) + Number(account.totalCost ?? 0);
                    }
                    return {
                        content: wrapUntrusted({
                            totalCost: overview.totals.cost,
                            currency: overview.totals.currency,
                            byProvider,
                            accounts: (overview.accounts ?? []).map((account) => ({
                                id: account.id,
                                alias: account.alias,
                                provider: account.provider,
                                totalCost: account.totalCost,
                            })),
                        }),
                        sources: [
                            source({
                                module: 'finops',
                                label: 'FinOps cost comparison',
                                detail: String(args.period ?? 'last30days'),
                                href: `/finops/multicloud?period=${encodeURIComponent(String(args.period ?? 'last30days'))}`,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_saving_opportunities',
                description:
                    'List FinOps saving opportunities across the organization by default, or for one cloud account when provided.',
                requiredModules: [SystemModule.FINOPS],
                parameters: {
                    type: 'object',
                    properties: {
                        cloudAccountId: { type: 'string', format: 'uuid' },
                        status: { type: 'string', enum: ['open', 'acknowledged', 'resolved'] },
                        limit: { type: 'number' },
                    },
                },
                schema: z.object({
                    cloudAccountId: z.string().uuid().optional(),
                    status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
                    limit: z.number().int().min(1).max(50).optional(),
                }),
                handler: async (args, ctx) => {
                    if (typeof args.cloudAccountId === 'string') {
                        await this.requireCloudAccount(args.cloudAccountId, ctx.organizationId);
                    }
                    const optimize = await this.finopsOrgOverviewService.getOptimize(ctx.organizationId, {
                        cloudAccountId: typeof args.cloudAccountId === 'string' ? args.cloudAccountId : undefined,
                        status: typeof args.status === 'string' ? args.status : 'open',
                        limit: typeof args.limit === 'number' ? String(args.limit) : '25',
                    });
                    const accountId = typeof args.cloudAccountId === 'string' ? args.cloudAccountId : undefined;
                    return {
                        content: wrapUntrusted(optimize),
                        sources: [
                            source({
                                module: 'finops',
                                label: 'FinOps optimize queue',
                                href: accountId
                                    ? `/finops?tab=optimize&account=${encodeURIComponent(accountId)}`
                                    : '/finops?tab=optimize',
                                cloudAccountId: accountId,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_cloud_resources_summary',
                description:
                    'Summarize inventoried cloud resources for all authorized accounts by default, or one account when cloudAccountId is provided.',
                requiredModules: [SystemModule.CLOUD_INVENTORY, SystemModule.ASSESSMENT],
                parameters: {
                    type: 'object',
                    properties: {
                        cloudAccountId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Optional. Omit to summarize all authorized cloud accounts.',
                        },
                    },
                },
                schema: z.object({
                    cloudAccountId: z.string().uuid().optional(),
                }),
                handler: async (args, ctx) => {
                    const accounts =
                        typeof args.cloudAccountId === 'string'
                            ? [await this.requireCloudAccount(String(args.cloudAccountId), ctx.organizationId)]
                            : await this.listAuthorizedAccounts(ctx.organizationId);

                    const results: Array<{
                        cloudAccountId: string;
                        alias: string;
                        provider: string;
                        summary: { totalResources: number; byType: Record<string, number> };
                    }> = [];

                    for (const account of accounts) {
                        let summary: { totalResources: number; byType: Record<string, number> };
                        if (account.provider === 'aws') {
                            const data = await this.awsAssessmentReportService.collectAllData(account.id);
                            summary = this.awsAssessmentReportService.buildSummary(data);
                        } else if (account.provider === 'azure') {
                            const data = await this.azureAssessmentReportService.collectAllData(account.id);
                            summary = this.azureAssessmentReportService.buildSummary(data);
                        } else if (account.provider === 'gcp') {
                            const data = await this.gcpAssessmentReportService.collectAllData(account.id);
                            summary = this.gcpAssessmentReportService.buildSummary(data);
                        } else {
                            summary = { totalResources: 0, byType: {} };
                        }
                        results.push({
                            cloudAccountId: account.id,
                            alias: account.alias,
                            provider: account.provider,
                            summary,
                        });
                    }

                    const single = results.length === 1 ? results[0] : null;
                    return {
                        content: wrapUntrusted({
                            scope: single ? 'account' : 'organization',
                            accounts: results,
                            totals: {
                                accounts: results.length,
                                totalResources: results.reduce((sum, row) => sum + row.summary.totalResources, 0),
                            },
                        }),
                        sources: [
                            source({
                                module: 'cloud_inventory',
                                label: 'Cloud Inventory summary',
                                detail: single ? `${single.alias} (${single.provider})` : `${results.length} contas`,
                                href: single ? `/cloud-accounts/${single.cloudAccountId}` : '/cloud-accounts',
                                cloudAccountId: single?.cloudAccountId,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_assessment_jobs',
                description:
                    'List recent assessment/sync jobs for all authorized accounts by default, or one account when cloudAccountId is provided.',
                requiredModules: [SystemModule.ASSESSMENT],
                parameters: {
                    type: 'object',
                    properties: {
                        cloudAccountId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Optional. Omit to list jobs across authorized cloud accounts.',
                        },
                    },
                },
                schema: z.object({
                    cloudAccountId: z.string().uuid().optional(),
                }),
                handler: async (args, ctx) => {
                    const accounts =
                        typeof args.cloudAccountId === 'string'
                            ? [await this.requireCloudAccount(String(args.cloudAccountId), ctx.organizationId)]
                            : await this.listAuthorizedAccounts(ctx.organizationId);

                    const allJobs: Array<Record<string, unknown>> = [];
                    for (const account of accounts) {
                        let jobs: unknown[] = [];
                        if (account.provider === 'aws') {
                            jobs = await this.awsAssessmentService.listJobs(account.id, ctx.organizationId);
                        } else if (account.provider === 'azure') {
                            jobs = await this.azureAssessmentService.listJobs(account.id, ctx.organizationId);
                        } else if (account.provider === 'gcp') {
                            jobs = await this.gcpAssessmentService.listJobs(account.id, ctx.organizationId);
                        }
                        for (const job of (jobs ?? []).slice(0, 10)) {
                            const row = job as Record<string, unknown>;
                            allJobs.push({
                                id: row.id,
                                status: row.status,
                                createdAt: row.createdAt,
                                completedAt: row.completedAt ?? row.finishedAt,
                                error: row.error ?? row.errorMessage ?? null,
                                cloudAccountId: account.id,
                                alias: account.alias,
                                provider: account.provider,
                            });
                        }
                    }

                    const singleId = typeof args.cloudAccountId === 'string' ? args.cloudAccountId : undefined;
                    return {
                        content: wrapUntrusted({
                            scope: singleId ? 'account' : 'organization',
                            jobs: allJobs.slice(0, 30),
                        }),
                        sources: [
                            source({
                                module: 'assessment',
                                label: 'Assessment jobs',
                                detail: singleId ? accounts[0]?.alias : `${accounts.length} contas`,
                                href: '/assessment',
                                cloudAccountId: singleId ?? accounts[0]?.id,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_governance_score',
                description:
                    'Get the latest governance compliance score for all authorized accounts by default, or one account when cloudAccountId is provided.',
                requiredModules: [SystemModule.GOVERNANCE],
                parameters: {
                    type: 'object',
                    properties: {
                        cloudAccountId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Optional. Omit to fetch scores for all authorized cloud accounts.',
                        },
                    },
                },
                schema: z.object({ cloudAccountId: z.string().uuid().optional() }),
                handler: async (args, ctx) => {
                    const accounts =
                        typeof args.cloudAccountId === 'string'
                            ? [await this.requireCloudAccount(String(args.cloudAccountId), ctx.organizationId)]
                            : await this.listAuthorizedAccounts(ctx.organizationId);

                    const scores = [];
                    for (const account of accounts) {
                        try {
                            const score = await this.governanceService.getLatestScore(account.id, ctx.organizationId);
                            scores.push({ cloudAccountId: account.id, alias: account.alias, provider: account.provider, score });
                        } catch {
                            scores.push({
                                cloudAccountId: account.id,
                                alias: account.alias,
                                provider: account.provider,
                                score: null,
                            });
                        }
                    }

                    const single = scores.length === 1 ? scores[0] : null;
                    return {
                        content: wrapUntrusted({ scope: single ? 'account' : 'organization', scores }),
                        sources: [
                            source({
                                module: 'governance',
                                label: 'Governance score',
                                detail: single ? single.alias : `${scores.length} contas`,
                                href: '/governance',
                                cloudAccountId: single?.cloudAccountId,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_governance_findings',
                description:
                    'List non-compliant governance findings from the latest completed scan across accounts by default, or one account when cloudAccountId is provided.',
                requiredModules: [SystemModule.GOVERNANCE],
                parameters: {
                    type: 'object',
                    properties: {
                        cloudAccountId: {
                            type: 'string',
                            format: 'uuid',
                            description: 'Optional. Omit to aggregate findings across authorized cloud accounts.',
                        },
                        severity: { type: 'string' },
                        limit: { type: 'number' },
                    },
                },
                schema: z.object({
                    cloudAccountId: z.string().uuid().optional(),
                    severity: z.string().optional(),
                    limit: z.number().int().min(1).max(50).optional(),
                }),
                handler: async (args, ctx) => {
                    const accounts =
                        typeof args.cloudAccountId === 'string'
                            ? [await this.requireCloudAccount(String(args.cloudAccountId), ctx.organizationId)]
                            : await this.listAuthorizedAccounts(ctx.organizationId);

                    const pageLimit = typeof args.limit === 'number' ? args.limit : 25;
                    const aggregated: Array<Record<string, unknown>> = [];
                    let primaryJobId: string | undefined;
                    let primaryAccountId: string | undefined;

                    for (const account of accounts) {
                        let score: Awaited<ReturnType<GovernanceService['getLatestScore']>> | null = null;
                        try {
                            score = await this.governanceService.getLatestScore(account.id, ctx.organizationId);
                        } catch {
                            score = null;
                        }
                        if (!score?.jobId) {
                            continue;
                        }
                        if (!primaryJobId) {
                            primaryJobId = score.jobId;
                            primaryAccountId = account.id;
                        }
                        const findingsPage = await this.governanceService.getJobFindings(
                            score.jobId,
                            account.id,
                            ctx.organizationId,
                            {
                                page: 1,
                                limit: pageLimit,
                                severity: typeof args.severity === 'string' ? (args.severity as never) : undefined,
                            },
                        );
                        for (const finding of (findingsPage.items ?? []).filter((item) => item.status === 'non_compliant')) {
                            aggregated.push({
                                cloudAccountId: account.id,
                                alias: account.alias,
                                jobId: score.jobId,
                                policyId: finding.policyId,
                                policyName: finding.policyName,
                                severity: finding.severity,
                                resourceType: finding.resourceType,
                                resourceId: finding.resourceId,
                                recommendation: finding.recommendation,
                                status: finding.status,
                            });
                            if (aggregated.length >= pageLimit) {
                                break;
                            }
                        }
                        if (aggregated.length >= pageLimit) {
                            break;
                        }
                    }

                    if (!aggregated.length) {
                        return {
                            content: wrapUntrusted({ message: ErrorMessages.AI_CHAT.NO_DATA, findings: [] }),
                            sources: [
                                source({
                                    module: 'governance',
                                    label: 'Governance findings',
                                    detail: 'no completed scan',
                                    href: '/governance',
                                }),
                            ],
                        };
                    }

                    const href = primaryJobId
                        ? `/governance/analysis?jobId=${encodeURIComponent(primaryJobId)}`
                        : '/governance';

                    return {
                        content: wrapUntrusted({
                            scope: typeof args.cloudAccountId === 'string' ? 'account' : 'organization',
                            findings: aggregated,
                        }),
                        sources: [
                            source({
                                module: 'governance',
                                label: 'Governance findings',
                                detail: primaryJobId ? `job ${primaryJobId}` : `${aggregated.length} findings`,
                                href,
                                cloudAccountId: primaryAccountId,
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_automations',
                description: 'List automation workflows for the organization with last execution summary.',
                requiredModules: [SystemModule.AUTOMATION],
                parameters: { type: 'object', properties: {} },
                schema: z.object({}),
                handler: async (_args, ctx) => {
                    const automations = await this.automationsCrudService.list(ctx.organizationId);
                    const safe = automations.slice(0, 50).map((item) => ({
                        id: item.id,
                        name: (item as { name?: string }).name,
                        status: item.status,
                        lastExecution: item.lastExecution
                            ? {
                                  id: item.lastExecution.id,
                                  status: item.lastExecution.status,
                                  createdAt: item.lastExecution.createdAt,
                              }
                            : null,
                    }));
                    return {
                        content: wrapUntrusted({ automations: safe }),
                        sources: [
                            source({
                                module: 'automation',
                                label: 'Automations',
                                detail: `${safe.length} workflows`,
                                href: '/automations',
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_automation_runs',
                description: 'List automation execution runs for the organization or a specific automation.',
                requiredModules: [SystemModule.AUTOMATION],
                parameters: {
                    type: 'object',
                    properties: {
                        automationId: { type: 'string', format: 'uuid' },
                    },
                },
                schema: z.object({
                    automationId: z.string().uuid().optional(),
                }),
                handler: async (args, ctx) => {
                    if (typeof args.automationId === 'string') {
                        const runs = await this.automationsCrudService.listExecutions(args.automationId, ctx.organizationId);
                        const safe = runs.slice(0, 30).map((run) => ({
                            id: run.id,
                            status: run.status,
                            createdAt: run.createdAt,
                            finishedAt: (run as { finishedAt?: Date | null }).finishedAt ?? null,
                        }));
                        return {
                            content: wrapUntrusted({ automationId: args.automationId, runs: safe }),
                            sources: [
                                source({
                                    module: 'automation',
                                    label: 'Automation runs',
                                    detail: args.automationId,
                                    href: `/automations/${args.automationId}`,
                                }),
                            ],
                        };
                    }
                    const runs = await this.automationService.listExecutions(ctx.organizationId);
                    const safe = runs.slice(0, 30).map((run) => ({
                        id: run.id,
                        status: run.status,
                        createdAt: run.createdAt,
                    }));
                    return {
                        content: wrapUntrusted({ runs: safe }),
                        sources: [
                            source({
                                module: 'automation',
                                label: 'Organization automation runs',
                                href: '/automations',
                            }),
                        ],
                    };
                },
            },
            {
                name: 'get_saas_documentation',
                description: 'Retrieve approved SaaS product documentation about modules and how to use the platform.',
                requiredModules: [],
                parameters: {
                    type: 'object',
                    properties: {
                        topic: {
                            type: 'string',
                            description: 'overview | finops | assessment | cloud_inventory | governance | automation | cloud_accounts | onboarding',
                        },
                    },
                },
                schema: z.object({
                    topic: z.string().max(64).optional(),
                }),
                handler: async (args) => {
                    const topic = typeof args.topic === 'string' ? args.topic : undefined;
                    const docs = getSaasDocsByTopic(topic);
                    return {
                        content: wrapUntrusted({ docs }),
                        sources: [
                            source({
                                module: 'docs',
                                label: 'SaaS documentation',
                                detail: String(topic ?? 'all'),
                                href: docsHref(topic),
                            }),
                        ],
                    };
                },
            },
        ];
    }
}
