import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AiFinopsConnection } from '../../db/entites/ai-finops-connection.entity';
import { AiFinopsTeamMember } from '../../db/entites/ai-finops-team-member.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { AiFinopsApplicationService } from '../services/ai-finops-application.service';
import { AiFinopsConnectionService } from '../services/ai-finops-connection.service';
import { AiFinopsPolicyService } from '../services/ai-finops-policy.service';
import { AiFinopsUsageService } from '../services/ai-finops-usage.service';
import { AiFinopsPricingService } from '../services/ai-finops-pricing.service';
import { AiFinopsQuotaService } from '../services/ai-finops-quota.service';

type ChatBody = {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    provider?: string;
    connectionId?: string;
};

@Injectable()
export class AiGatewayService {
    private readonly logger = new Logger(AiGatewayService.name);

    constructor(
        private readonly applications: AiFinopsApplicationService,
        private readonly connections: AiFinopsConnectionService,
        private readonly policies: AiFinopsPolicyService,
        private readonly usage: AiFinopsUsageService,
        private readonly pricing: AiFinopsPricingService,
        private readonly quotas: AiFinopsQuotaService,
        @InjectRepository(AiFinopsConnection)
        private readonly connectionRepository: Repository<AiFinopsConnection>,
        @InjectRepository(AiFinopsTeamMember)
        private readonly teamMemberRepository: Repository<AiFinopsTeamMember>,
    ) {}

    private async resolveTeamId(userId: string | null, organizationId: string): Promise<string | null> {
        if (!userId) return null;
        const membership = await this.teamMemberRepository
            .createQueryBuilder('member')
            .innerJoin('member.team', 'team')
            .where('member.user_id = :userId', { userId })
            .andWhere('team.organization_id = :organizationId', { organizationId })
            .andWhere('team.status = :status', { status: 'active' })
            .orderBy('member.created_at', 'ASC')
            .getOne();
        return membership?.teamId ?? null;
    }

    private async resolveContext(rawApiKey: string, body: ChatBody) {
        const apiKey = await this.applications.resolveApiKey(rawApiKey);
        const application = apiKey.application;
        if (!application || application.status !== 'active') {
            throw new NotFoundException(ErrorMessages.AI_FINOPS.APPLICATION_NOT_FOUND);
        }

        const providerSlug = body.provider ?? 'openai';
        if (apiKey.allowedProviders.length && !apiKey.allowedProviders.includes(providerSlug)) {
            throw new BadRequestException(ErrorMessages.AI_FINOPS.POLICY_BLOCKED);
        }
        if (apiKey.allowedModels.length && !apiKey.allowedModels.includes(body.model)) {
            throw new BadRequestException(ErrorMessages.AI_FINOPS.POLICY_BLOCKED);
        }

        const connection = body.connectionId
            ? await this.connectionRepository.findOne({
                  where: {
                      id: body.connectionId,
                      tenantId: apiKey.tenantId,
                      organizationId: application.organizationId,
                  },
              })
            : await this.connectionRepository.findOne({
                  where: {
                      tenantId: apiKey.tenantId,
                      organizationId: application.organizationId,
                      providerSlug,
                      status: 'active' as const,
                  },
                  order: { createdAt: 'DESC' },
              });

        if (!connection) {
            throw new NotFoundException(ErrorMessages.AI_FINOPS.CONNECTION_NOT_FOUND);
        }

        const teamId = await this.resolveTeamId(apiKey.userId, application.organizationId);
        const estimatedTokens = Math.max(
            1,
            Math.ceil(JSON.stringify(body.messages).length / 4) + (body.max_tokens ?? 256),
        );

        const policyResult = await this.policies.evaluateGatewayRequest({
            tenantId: apiKey.tenantId,
            organizationId: application.organizationId,
            connectionId: connection.id,
            userId: apiKey.userId,
            teamId,
            applicationId: application.id,
            provider: providerSlug,
            model: body.model,
            estimatedTokens,
            estimatedCost: 0,
        });

        const reservation = await this.quotas.reserve({
            tenantId: apiKey.tenantId,
            organizationId: application.organizationId,
            connectionId: connection.id,
            userId: apiKey.userId,
            teamId,
            applicationId: application.id,
            estimatedTokens,
            estimatedCostCents: 0,
            maxTokens: policyResult.maxTokens,
            maxCost: policyResult.maxCost,
            maxRequestsPerMinute: policyResult.maxRequestsPerMinute,
        });

        const creds = await this.connections.decryptConnectionCredentials(connection.id, apiKey.tenantId);
        const providerApiKey = typeof creds.apiKey === 'string' ? creds.apiKey : null;
        if (!providerApiKey) {
            await this.quotas.release(reservation);
            throw new BadRequestException(ErrorMessages.AI_FINOPS.CREDENTIAL_VALIDATION_FAILED);
        }

        return { apiKey, application, connection, teamId, providerApiKey, creds, reservation, providerSlug };
    }

    private async recordUsage(input: {
        apiKey: { tenantId: string; userId: string | null };
        application: { id: string; organizationId: string };
        connection: AiFinopsConnection;
        teamId: string | null;
        model: string;
        requestId: string | null;
        providerRequestId: string | null;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        latencyMs: number;
        status: 'success' | 'error' | 'pending_reconciliation';
        metadata?: Record<string, unknown>;
    }) {
        let estimatedCost: number | null = null;
        const modelEntity = (await this.pricing.listModels(input.connection.providerId)).find(
            (m) => m.modelIdentifier === input.model,
        );
        if (modelEntity) {
            const estimate = await this.pricing.estimateCost({
                modelId: modelEntity.id,
                occurredAt: new Date(),
                inputTokens: input.inputTokens,
                outputTokens: input.outputTokens,
            });
            estimatedCost = estimate?.estimatedCost ?? null;
        }

        await this.usage.ingest({
            tenantId: input.apiKey.tenantId,
            organizationId: input.application.organizationId,
            connectionId: input.connection.id,
            provider: input.connection.providerSlug,
            applicationId: input.application.id,
            userId: input.apiKey.userId,
            teamId: input.teamId,
            model: input.model,
            requestId: input.requestId,
            providerRequestId: input.providerRequestId,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            totalTokens: input.totalTokens,
            estimatedCost,
            officialCost: null,
            currency: 'USD',
            latencyMs: input.latencyMs,
            status: input.status,
            usageSource: 'gateway',
            occurredAt: new Date(),
            metadata: {
                note: 'estimated_cost is Gateway-side only; never treat as official provider invoice.',
                ...(input.metadata ?? {}),
            },
        });
    }

    async chatCompletions(input: {
        rawApiKey: string;
        body: ChatBody;
        requestIdHeader?: string;
    }) {
        const ctx = await this.resolveContext(input.rawApiKey, input.body);
        const started = Date.now();
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ctx.providerApiKey}`,
                    'Content-Type': 'application/json',
                    ...(typeof ctx.creds.organizationId === 'string'
                        ? { 'OpenAI-Organization': ctx.creds.organizationId }
                        : {}),
                    ...(typeof ctx.creds.projectId === 'string'
                        ? { 'OpenAI-Project': ctx.creds.projectId }
                        : {}),
                },
                body: JSON.stringify({
                    model: input.body.model,
                    messages: input.body.messages,
                    max_tokens: input.body.max_tokens,
                    temperature: input.body.temperature,
                    stream: false,
                }),
            });

            const latencyMs = Date.now() - started;
            const payload = (await response.json().catch(() => ({}))) as {
                id?: string;
                usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
                error?: { message?: string };
            };

            const inputTokens = Number(payload.usage?.prompt_tokens ?? 0);
            const outputTokens = Number(payload.usage?.completion_tokens ?? 0);
            const totalTokens = Number(payload.usage?.total_tokens ?? inputTokens + outputTokens);

            await this.recordUsage({
                apiKey: ctx.apiKey,
                application: ctx.application,
                connection: ctx.connection,
                teamId: ctx.teamId,
                model: input.body.model,
                requestId: input.requestIdHeader || randomUUID(),
                providerRequestId: payload.id ?? null,
                inputTokens,
                outputTokens,
                totalTokens,
                latencyMs,
                status: response.ok ? 'success' : 'error',
                metadata: { httpStatus: response.status },
            });

            await this.quotas.commit(ctx.reservation);

            if (!response.ok) {
                this.logger.warn(`gateway.provider_error status=${response.status}`);
                throw new BadRequestException(payload.error?.message ?? 'Provider request failed');
            }
            return payload;
        } catch (error) {
            await this.quotas.release(ctx.reservation);
            throw error;
        }
    }

    async chatCompletionsStream(input: {
        rawApiKey: string;
        body: ChatBody;
        requestIdHeader?: string;
        write: (chunk: string) => void;
        end: () => void;
    }) {
        const ctx = await this.resolveContext(input.rawApiKey, input.body);
        const started = Date.now();
        let inputTokens = 0;
        let outputTokens = 0;
        let providerRequestId: string | null = null;
        let status: 'success' | 'error' | 'pending_reconciliation' = 'pending_reconciliation';

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ctx.providerApiKey}`,
                    'Content-Type': 'application/json',
                    ...(typeof ctx.creds.organizationId === 'string'
                        ? { 'OpenAI-Organization': ctx.creds.organizationId }
                        : {}),
                    ...(typeof ctx.creds.projectId === 'string'
                        ? { 'OpenAI-Project': ctx.creds.projectId }
                        : {}),
                },
                body: JSON.stringify({
                    model: input.body.model,
                    messages: input.body.messages,
                    max_tokens: input.body.max_tokens,
                    temperature: input.body.temperature,
                    stream: true,
                    stream_options: { include_usage: true },
                }),
            });

            if (!response.ok || !response.body) {
                status = 'error';
                input.write(
                    `data: ${JSON.stringify({ error: { message: 'Provider stream failed' } })}\n\n`,
                );
                input.write('data: [DONE]\n\n');
                input.end();
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                buffer += text;
                input.write(text);

                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data) as {
                            id?: string;
                            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
                        };
                        if (parsed.id) providerRequestId = parsed.id;
                        if (parsed.usage) {
                            inputTokens = Number(parsed.usage.prompt_tokens ?? inputTokens);
                            outputTokens = Number(parsed.usage.completion_tokens ?? outputTokens);
                            status = 'success';
                        }
                    } catch {
                        // ignore partial JSON lines
                    }
                }
            }

            if (status !== 'success') {
                status = 'pending_reconciliation';
            }
            input.end();
            await this.quotas.commit(ctx.reservation);
        } catch (error) {
            await this.quotas.release(ctx.reservation);
            status = 'pending_reconciliation';
            this.logger.warn(
                `gateway.stream.error: ${error instanceof Error ? error.message : 'unknown'} — recorded for reconciliation`,
            );
            try {
                input.write('data: [DONE]\n\n');
                input.end();
            } catch {
                // response may already be closed
            }
        } finally {
            await this.recordUsage({
                apiKey: ctx.apiKey,
                application: ctx.application,
                connection: ctx.connection,
                teamId: ctx.teamId,
                model: input.body.model,
                requestId: input.requestIdHeader || randomUUID(),
                providerRequestId,
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                latencyMs: Date.now() - started,
                status,
                metadata: { stream: true },
            });
        }
    }
}
