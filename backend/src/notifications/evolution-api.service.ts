import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorMessages } from '../common/messages/error-messages';

const EVOLUTION_TIMEOUT_MS = 20_000;

@Injectable()
export class EvolutionApiService {
    private readonly logger = new Logger(EvolutionApiService.name);

    constructor(private readonly configService: ConfigService) {}

    isConfigured(): boolean {
        return Boolean(this.baseUrl && this.apiKey && this.instance);
    }

    async sendText(params: { number: string; text: string }): Promise<void> {
        if (!this.isConfigured()) {
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.EVOLUTION_NOT_CONFIGURED);
        }

        const url = `${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`;

        await this.requestJson({
            url,
            method: 'POST',
            body: {
                number: params.number,
                text: params.text,
            },
            errorMessage: ErrorMessages.NOTIFICATIONS.WHATSAPP_TEST_SEND_FAILED,
            context: `sendText number=${params.number}`,
        });
    }

    /**
     * Entra em um grupo WhatsApp pelo código/link de convite e devolve o JID (...@g.us).
     * Evolution: GET /group/acceptInviteCode/{instance}?inviteCode=...
     */
    async acceptGroupInvite(inviteInput: string): Promise<{ groupJid: string; inviteCode: string }> {
        if (!this.isConfigured()) {
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.EVOLUTION_NOT_CONFIGURED);
        }

        const inviteCode = this.extractInviteCode(inviteInput);
        if (!inviteCode) {
            throw new BadRequestException(ErrorMessages.NOTIFICATIONS.INVALID_WHATSAPP_INVITE);
        }

        const url =
            `${this.baseUrl}/group/acceptInviteCode/${encodeURIComponent(this.instance)}` +
            `?inviteCode=${encodeURIComponent(inviteCode)}`;

        const payload = await this.requestJson<Record<string, unknown>>({
            url,
            method: 'GET',
            errorMessage: ErrorMessages.NOTIFICATIONS.WHATSAPP_JOIN_GROUP_FAILED,
            context: `acceptInviteCode code=${inviteCode}`,
        });

        const groupJid = this.extractGroupJid(payload);
        if (!groupJid) {
            this.logger.error(
                `evolution.acceptInviteCode missing groupJid code=${inviteCode} body=${JSON.stringify(payload).slice(0, 400)}`,
            );
            throw new ServiceUnavailableException(ErrorMessages.NOTIFICATIONS.WHATSAPP_JOIN_GROUP_FAILED);
        }

        return { groupJid, inviteCode };
    }

    extractInviteCode(raw: string): string | null {
        const value = raw.trim();
        if (!value) {
            return null;
        }

        try {
            if (value.includes('chat.whatsapp.com') || value.includes('whatsapp.com/invite')) {
                const url = new URL(value.startsWith('http') ? value : `https://${value}`);
                const parts = url.pathname.split('/').filter(Boolean);
                const code = parts[parts.length - 1]?.split('?')[0]?.trim();
                if (code && /^[a-zA-Z0-9_-]{10,64}$/.test(code)) {
                    return code;
                }
            }
        } catch {
            // fall through to raw code parse
        }

        const maybeCode = value.replace(/^https?:\/\//, '').replace(/.*chat\.whatsapp\.com\//i, '').split(/[?#\s]/)[0];
        if (maybeCode && /^[a-zA-Z0-9_-]{10,64}$/.test(maybeCode)) {
            return maybeCode;
        }

        return null;
    }

    private extractGroupJid(payload: Record<string, unknown>): string | null {
        const candidates = [
            payload.groupJid,
            payload.groupJId,
            payload.jid,
            payload.id,
            (payload.data as Record<string, unknown> | undefined)?.groupJid,
            (payload.data as Record<string, unknown> | undefined)?.jid,
        ];

        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.includes('@g.us')) {
                return candidate.trim();
            }
        }

        return null;
    }

    private async requestJson<T = unknown>(params: {
        url: string;
        method: 'GET' | 'POST' | 'PUT';
        body?: Record<string, unknown>;
        errorMessage: string;
        context: string;
    }): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EVOLUTION_TIMEOUT_MS);

        try {
            const response = await fetch(params.url, {
                method: params.method,
                headers: {
                    'Content-Type': 'application/json',
                    apikey: this.apiKey,
                },
                body: params.body ? JSON.stringify(params.body) : undefined,
                signal: controller.signal,
            });

            const raw = await response.text().catch(() => '');
            let parsed: unknown = null;
            if (raw) {
                try {
                    parsed = JSON.parse(raw) as unknown;
                } catch {
                    parsed = raw;
                }
            }

            if (!response.ok) {
                this.logger.error(
                    `evolution.${params.context} failed status=${response.status} body=${raw.slice(0, 400)}`,
                );
                throw new ServiceUnavailableException(params.errorMessage);
            }

            return (parsed ?? {}) as T;
        } catch (error) {
            if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) {
                throw error;
            }

            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`evolution.${params.context} error: ${message}`);
            throw new ServiceUnavailableException(params.errorMessage);
        } finally {
            clearTimeout(timeout);
        }
    }

    private get baseUrl(): string {
        return (this.configService.get<string>('EVOLUTION_API_URL') ?? '').replace(/\/$/, '').trim();
    }

    private get apiKey(): string {
        return (this.configService.get<string>('EVOLUTION_API_KEY') ?? '').trim();
    }

    private get instance(): string {
        return (this.configService.get<string>('EVOLUTION_INSTANCE') ?? '').trim();
    }
}
