import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { ErrorMessages } from '../../common/messages/error-messages';
import {
    FinopsAnomalyAlertEvent,
} from '../../db/entites/finops-anomaly-alert-event.entity';
import {
    FinopsAnomalyAlertChannel,
    FinopsAnomalyAlertSettings,
} from '../../db/entites/finops-anomaly-alert-settings.entity';
import {
    AnomalySeverity,
    FinopsCostAnomaly,
} from '../../db/entites/finops-cost-anomaly.entity';
import { Organization } from '../../db/entites/organization.entity';
import { MailerService } from '../../mailer/mailer.service';
import { NotificationsService } from '../../notifications/notifications.service';

const SEVERITY_RANK: Record<AnomalySeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};

const SEVERITY_EMOJI: Record<AnomalySeverity, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
};

const SEVERITY_LABEL: Record<AnomalySeverity, string> = {
    critical: 'crítica',
    high: 'alta',
    medium: 'média',
    low: 'baixa',
};

const DIGEST_LOOKBACK_DAYS = 7;

export type AnomalyAlertSettingsDto = {
    id: string | null;
    organizationId: string;
    enabled: boolean;
    alertChannels: FinopsAnomalyAlertChannel[];
    alertNotificationGroupIds: string[];
    minSeverity: AnomalySeverity;
    updatedAt: string | null;
};

export type UpdateAnomalyAlertSettingsDto = {
    enabled: boolean;
    alertChannels?: FinopsAnomalyAlertChannel[];
    alertNotificationGroupIds?: string[];
    minSeverity?: AnomalySeverity;
};

@Injectable()
export class FinopsAnomalyAlertService {
    private readonly logger = new Logger(FinopsAnomalyAlertService.name);

    constructor(
        @InjectRepository(FinopsAnomalyAlertSettings)
        private readonly settingsRepo: Repository<FinopsAnomalyAlertSettings>,

        @InjectRepository(FinopsAnomalyAlertEvent)
        private readonly eventRepo: Repository<FinopsAnomalyAlertEvent>,

        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepo: Repository<FinopsCostAnomaly>,

        @InjectRepository(Organization)
        private readonly organizationRepo: Repository<Organization>,

        private readonly notificationsService: NotificationsService,
        private readonly mailerService: MailerService,
    ) {}

    async getSettings(organizationId: string): Promise<AnomalyAlertSettingsDto> {
        const settings = await this.settingsRepo.findOne({ where: { organizationId } });
        return this.toDto(organizationId, settings);
    }

    async upsertSettings(
        organizationId: string,
        dto: UpdateAnomalyAlertSettingsDto,
    ): Promise<AnomalyAlertSettingsDto> {
        const channels = this.normalizeChannels(dto.alertChannels ?? []);
        const minSeverity = dto.minSeverity ?? 'high';

        let groupIds: string[] = [];
        if (dto.enabled) {
            if (channels.length === 0) {
                throw new BadRequestException(ErrorMessages.FINOPS.ANOMALY_ALERT_CHANNEL_REQUIRED);
            }
            groupIds = await this.validateAndNormalizeNotificationGroups(
                organizationId,
                channels,
                dto.alertNotificationGroupIds ?? [],
            );
        } else {
            const rawIds = [...new Set((dto.alertNotificationGroupIds ?? []).filter(Boolean))];
            if (rawIds.length > 0 && channels.length > 0) {
                groupIds = await this.validateAndNormalizeNotificationGroups(
                    organizationId,
                    channels,
                    rawIds,
                );
            } else {
                groupIds = rawIds;
            }
        }

        let settings = await this.settingsRepo.findOne({ where: { organizationId } });
        if (!settings) {
            settings = this.settingsRepo.create({ organizationId });
        }

        settings.enabled = dto.enabled;
        settings.alertChannels = channels;
        settings.alertNotificationGroupIds = groupIds;
        settings.minSeverity = minSeverity;

        const saved = await this.settingsRepo.save(settings);
        return this.toDto(organizationId, saved);
    }

    /**
     * Digest diário: um e-mail/WhatsApp por org com anomalias abertas dos últimos 7 dias
     * (filtradas por minSeverity), deduplicado por periodKey UTC.
     */
    async evaluateAndNotifyDigests(): Promise<{ evaluated: number; notified: number }> {
        const allSettings = await this.settingsRepo.find({ where: { enabled: true } });
        let notified = 0;

        for (const settings of allSettings) {
            try {
                const sent = await this.dispatchDigestForOrg(settings);
                if (sent > 0) notified += 1;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    `Anomaly digest org=${settings.organizationId} failed: ${message}`,
                );
            }
        }

        return { evaluated: allSettings.length, notified };
    }

    private async dispatchDigestForOrg(settings: FinopsAnomalyAlertSettings): Promise<number> {
        const channels = settings.alertChannels ?? [];
        const groupIds = settings.alertNotificationGroupIds ?? [];
        if (channels.length === 0 || groupIds.length === 0) {
            return 0;
        }

        const anomalies = await this.findOpenAnomaliesForDigest(
            settings.organizationId,
            settings.minSeverity,
        );
        if (anomalies.length === 0) {
            this.logger.debug(
                `Anomaly digest org=${settings.organizationId}: nenhuma anomalia elegível`,
            );
            return 0;
        }

        const periodKey = this.getUtcPeriodKey();
        const pendingChannels: FinopsAnomalyAlertChannel[] = [];

        for (const channel of channels) {
            const already = await this.eventRepo.findOne({
                where: {
                    organizationId: settings.organizationId,
                    periodKey,
                    channel,
                },
                select: ['id'],
            });
            if (!already) pendingChannels.push(channel);
        }

        if (pendingChannels.length === 0) {
            return 0;
        }

        let sentCount = 0;

        if (pendingChannels.includes('email')) {
            const ok = await this.dispatchEmailDigest(settings, anomalies, groupIds);
            if (ok) {
                await this.recordEvent(settings.organizationId, periodKey, 'email', anomalies.length);
                sentCount += 1;
            }
        }

        if (pendingChannels.includes('whatsapp')) {
            try {
                const text = await this.buildAnomalyWhatsappText(
                    settings.organizationId,
                    settings.minSeverity,
                    anomalies,
                );
                const result = await this.notificationsService.sendWhatsappAlertToGroups(
                    settings.organizationId,
                    groupIds,
                    text,
                );
                this.logger.log(
                    `Anomaly digest org=${settings.organizationId}: WhatsApp sent=${result.sent} failed=${result.failed}`,
                );
                if (result.sent > 0) {
                    await this.recordEvent(
                        settings.organizationId,
                        periodKey,
                        'whatsapp',
                        anomalies.length,
                    );
                    sentCount += 1;
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(
                    `Anomaly digest org=${settings.organizationId}: WhatsApp failed: ${message}`,
                );
            }
        }

        return sentCount;
    }

    private async dispatchEmailDigest(
        settings: FinopsAnomalyAlertSettings,
        anomalies: FinopsCostAnomaly[],
        groupIds: string[],
    ): Promise<boolean> {
        try {
            const emails = await this.notificationsService.listActiveEmailsFromGroups(
                settings.organizationId,
                groupIds,
            );
            if (emails.length === 0) {
                this.logger.debug(
                    `Anomaly digest org=${settings.organizationId}: nenhum e-mail ativo`,
                );
                return false;
            }

            await this.mailerService.sendFinopsAnomalyDigest({
                to: emails,
                minSeverity: settings.minSeverity,
                lookbackDays: DIGEST_LOOKBACK_DAYS,
                anomalies: anomalies.map((a) => ({
                    service: a.service,
                    cloudProvider: a.cloudProvider,
                    severity: a.severity,
                    anomalyDate: this.toDateKey(a.anomalyDate),
                    financialImpact: Number(a.financialImpact),
                    deviationPercentage: Number(a.deviationPercentage),
                    currency: a.currency,
                    region: a.region || null,
                })),
            });

            this.logger.log(
                `Anomaly digest org=${settings.organizationId}: e-mail enviado para ${emails.join(', ')}`,
            );
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Anomaly digest org=${settings.organizationId}: e-mail failed: ${message}`,
            );
            return false;
        }
    }

    private async findOpenAnomaliesForDigest(
        organizationId: string,
        minSeverity: AnomalySeverity,
    ): Promise<FinopsCostAnomaly[]> {
        const since = new Date();
        since.setUTCHours(0, 0, 0, 0);
        since.setUTCDate(since.getUTCDate() - (DIGEST_LOOKBACK_DAYS - 1));

        const rows = await this.anomalyRepo.find({
            where: {
                organizationId,
                status: 'open',
                anomalyDate: MoreThanOrEqual(since),
            },
            relations: ['cloudAccount'],
            order: { financialImpact: 'DESC' },
            take: 200,
        });

        const minRank = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK.high;
        return rows.filter((row) => (SEVERITY_RANK[row.severity] ?? 0) >= minRank);
    }

    private async recordEvent(
        organizationId: string,
        periodKey: string,
        channel: FinopsAnomalyAlertChannel,
        anomalyCount: number,
    ): Promise<void> {
        try {
            await this.eventRepo.save(
                this.eventRepo.create({
                    organizationId,
                    periodKey,
                    channel,
                    anomalyCount,
                    sentAt: new Date(),
                }),
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (
                !message.toLowerCase().includes('unique') &&
                !message.includes('UQ_finops_anomaly_alert')
            ) {
                this.logger.warn(
                    `Anomaly digest org=${organizationId}: falha ao gravar event channel=${channel}: ${message}`,
                );
            }
        }
    }

    private async validateAndNormalizeNotificationGroups(
        organizationId: string,
        channels: FinopsAnomalyAlertChannel[],
        groupIds: string[],
    ): Promise<string[]> {
        const uniqueIds = [...new Set(groupIds.filter(Boolean))];
        const groups = await this.notificationsService.findGroupsByIds(organizationId, uniqueIds);

        if (groups.length !== uniqueIds.length) {
            throw new BadRequestException(ErrorMessages.FINOPS.INVALID_NOTIFICATION_GROUPS);
        }

        const emailGroupIds = groups.filter((g) => g.channel === 'email').map((g) => g.id);
        const whatsappGroupIds = groups.filter((g) => g.channel === 'whatsapp').map((g) => g.id);

        if (groups.some((g) => g.channel !== 'email' && g.channel !== 'whatsapp')) {
            throw new BadRequestException(ErrorMessages.FINOPS.INVALID_NOTIFICATION_GROUPS);
        }

        if (channels.includes('email') && emailGroupIds.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.EMAIL_NOTIFICATION_GROUP_REQUIRED);
        }

        if (channels.includes('whatsapp') && whatsappGroupIds.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.WHATSAPP_NOTIFICATION_GROUP_REQUIRED);
        }

        const allowed: string[] = [];
        if (channels.includes('email')) allowed.push(...emailGroupIds);
        if (channels.includes('whatsapp')) allowed.push(...whatsappGroupIds);

        // Se channels vazio (prefs desativadas), mantém os IDs válidos de ambos.
        if (channels.length === 0) {
            return [...new Set([...emailGroupIds, ...whatsappGroupIds])];
        }

        return [...new Set(allowed)];
    }

    private normalizeChannels(
        channels: FinopsAnomalyAlertChannel[],
    ): FinopsAnomalyAlertChannel[] {
        const allowed: FinopsAnomalyAlertChannel[] = ['email', 'whatsapp'];
        return [...new Set(channels.filter((c) => allowed.includes(c)))];
    }

    private getUtcPeriodKey(date = new Date()): string {
        return date.toISOString().slice(0, 10);
    }

    private toDateKey(value: Date | string): string {
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        return String(value).slice(0, 10);
    }

    private async buildAnomalyWhatsappText(
        organizationId: string,
        minSeverity: AnomalySeverity,
        anomalies: FinopsCostAnomaly[],
    ): Promise<string> {
        const context = await this.loadOrganizationContext(organizationId);
        const shown = anomalies.slice(0, 15);
        const items = shown
            .map((anomaly, index) => this.formatAnomalyWhatsappItem(anomaly, index))
            .join('\n\n');
        const extra =
            anomalies.length > shown.length
                ? `\n\n… e mais ${anomalies.length - shown.length} anomalia(s)`
                : '';

        return [
            `🚨 *SaaS MultiCloud* — digest de anomalias`,
            ``,
            `🏢 Tenant: ${context.tenantName}`,
            `🏬 Organização: ${context.organizationName}`,
            ``,
            `${anomalies.length} anomalia(s) aberta(s) nos últimos ${DIGEST_LOOKBACK_DAYS} dias`,
            `Severidade mínima: ${SEVERITY_LABEL[minSeverity] ?? minSeverity}`,
            ``,
            `${items}${extra}`,
        ].join('\n');
    }

    private formatAnomalyWhatsappItem(anomaly: FinopsCostAnomaly, index: number): string {
        const emoji = SEVERITY_EMOJI[anomaly.severity] ?? '🟡';
        const provider = anomaly.cloudProvider.toUpperCase();
        const account = anomaly.cloudAccount?.alias?.trim() || '—';
        const date = this.formatDateBr(anomaly.anomalyDate);
        const region = anomaly.region?.trim();
        const when = region ? `${date} · ${region}` : date;
        const deviation = Number(anomaly.deviationPercentage).toFixed(0);
        const impact = this.formatPtBr(Number(anomaly.financialImpact), 2);
        const expected = this.formatPtBr(Number(anomaly.expectedCost), 2);
        const actual = this.formatPtBr(Number(anomaly.actualCost), 2);

        return [
            `${index + 1}. ${emoji} *${anomaly.service}* · ${provider}`,
            `   ☁️ Conta: ${account}`,
            `   📅 ${when}`,
            `   📈 +${deviation}% · impacto ${impact} ${anomaly.currency}`,
            `   Esperado ${expected} → real ${actual}`,
        ].join('\n');
    }

    private formatDateBr(value: Date | string): string {
        const key = this.toDateKey(value);
        const [year, month, day] = key.split('-');
        if (!year || !month || !day) return key;
        return `${day}/${month}/${year}`;
    }

    private async loadOrganizationContext(
        organizationId: string,
    ): Promise<{ tenantName: string; organizationName: string }> {
        const organization = await this.organizationRepo.findOne({
            where: { id: organizationId },
            relations: ['tenant'],
        });

        return {
            tenantName: organization?.tenant?.name?.trim() || '—',
            organizationName: organization?.name?.trim() || '—',
        };
    }

    private formatPtBr(value: number, fractionDigits: number): string {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }).format(value);
    }

    private toDto(
        organizationId: string,
        settings: FinopsAnomalyAlertSettings | null,
    ): AnomalyAlertSettingsDto {
        if (!settings) {
            return {
                id: null,
                organizationId,
                enabled: false,
                alertChannels: [],
                alertNotificationGroupIds: [],
                minSeverity: 'high',
                updatedAt: null,
            };
        }

        return {
            id: settings.id,
            organizationId: settings.organizationId,
            enabled: settings.enabled,
            alertChannels: settings.alertChannels ?? [],
            alertNotificationGroupIds: settings.alertNotificationGroupIds ?? [],
            minSeverity: settings.minSeverity ?? 'high',
            updatedAt: settings.updatedAt?.toISOString?.() ?? null,
        };
    }
}
