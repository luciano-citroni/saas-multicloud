import { ForbiddenException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ErrorMessages } from '../../common/messages/error-messages';

export type QuotaReservation = {
    reservationId: string;
    deltas: Array<{ key: string; amount: number }>;
};

@Injectable()
export class AiFinopsQuotaService implements OnModuleDestroy {
    private readonly logger = new Logger(AiFinopsQuotaService.name);
    private readonly redis: Redis;

    constructor(private readonly configService: ConfigService) {
        const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
        const password = this.configService.get<string>('REDIS_PASSWORD')?.trim();
        this.redis = new Redis({
            host: this.configService.get<string>('REDIS_HOST', 'localhost'),
            port: Number(this.configService.get<string>('REDIS_PORT') ?? 6379),
            password: password || undefined,
            maxRetriesPerRequest: 1,
            lazyConnect: true,
        });
        if (isProduction && !password) {
            this.logger.warn('REDIS_PASSWORD missing in production for AI FinOps quotas');
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit().catch(() => undefined);
    }

    private monthKey(): string {
        return new Date().toISOString().slice(0, 7);
    }

    private async ensureConnected(): Promise<void> {
        if (this.redis.status === 'ready') return;
        await this.redis.connect().catch(() => undefined);
    }

    /**
     * Reserve estimated tokens/cost across scopes. Uses Redis INCRBY for concurrent safety.
     * Call commit to keep, or release to roll back the reservation deltas.
     */
    async reserve(input: {
        tenantId: string;
        organizationId: string;
        connectionId?: string | null;
        userId?: string | null;
        teamId?: string | null;
        applicationId?: string | null;
        estimatedTokens: number;
        estimatedCostCents: number;
        maxTokens?: number | null;
        maxCost?: number | null;
        maxRequestsPerMinute?: number | null;
    }): Promise<QuotaReservation> {
        await this.ensureConnected();
        const reservationId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const deltas: Array<{ key: string; amount: number }> = [];
        const month = this.monthKey();

        const scopes: Array<{ label: string; id: string }> = [
            { label: 'org', id: input.organizationId },
        ];
        if (input.connectionId) scopes.push({ label: 'connection', id: input.connectionId });
        if (input.teamId) scopes.push({ label: 'team', id: input.teamId });
        if (input.userId) scopes.push({ label: 'user', id: input.userId });
        if (input.applicationId) scopes.push({ label: 'app', id: input.applicationId });

        try {
            if (input.maxRequestsPerMinute != null) {
                const rpmKey = `aifp:rpm:${input.tenantId}:${input.organizationId}:${input.userId ?? 'anon'}`;
                const rpm = await this.redis.incr(rpmKey);
                if (rpm === 1) await this.redis.expire(rpmKey, 60);
                deltas.push({ key: rpmKey, amount: 1 });
                if (rpm > input.maxRequestsPerMinute) {
                    throw new ForbiddenException(ErrorMessages.AI_FINOPS.RATE_LIMITED);
                }
            }

            for (const scope of scopes) {
                if (input.maxTokens != null) {
                    const tokenKey = `aifp:tokens:${input.tenantId}:${scope.label}:${scope.id}:${month}`;
                    const used = await this.redis.incrby(tokenKey, input.estimatedTokens);
                    if (used === input.estimatedTokens) await this.redis.expire(tokenKey, 60 * 60 * 24 * 40);
                    deltas.push({ key: tokenKey, amount: input.estimatedTokens });
                    if (used > input.maxTokens) {
                        throw new ForbiddenException(ErrorMessages.AI_FINOPS.POLICY_BLOCKED);
                    }
                }
                if (input.maxCost != null) {
                    const costKey = `aifp:cost:${input.tenantId}:${scope.label}:${scope.id}:${month}`;
                    const used = await this.redis.incrby(costKey, input.estimatedCostCents);
                    if (used === input.estimatedCostCents) {
                        await this.redis.expire(costKey, 60 * 60 * 24 * 40);
                    }
                    deltas.push({ key: costKey, amount: input.estimatedCostCents });
                    if (used > Math.floor(input.maxCost * 100)) {
                        throw new ForbiddenException(ErrorMessages.AI_FINOPS.BUDGET_EXCEEDED);
                    }
                }
            }

            return { reservationId, deltas };
        } catch (error) {
            await this.release({ reservationId, deltas });
            throw error;
        }
    }

    async release(reservation: QuotaReservation): Promise<void> {
        await this.ensureConnected();
        for (const delta of reservation.deltas) {
            if (delta.amount > 0) {
                await this.redis.decrby(delta.key, delta.amount).catch(() => undefined);
            }
        }
        this.logger.debug(`quota.release ${reservation.reservationId} deltas=${reservation.deltas.length}`);
    }

    async commit(_reservation: QuotaReservation): Promise<void> {
        // Reservation already committed via INCRBY; nothing to do.
    }
}
