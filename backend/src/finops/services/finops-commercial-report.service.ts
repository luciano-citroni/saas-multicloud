import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';

import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { Organization } from '../../db/entites/organization.entity';
import { FinopsCommercialReportSend } from '../../db/entites/finops-commercial-report-send.entity';
import { FinopsCommercialReportSettings } from '../../db/entites/finops-commercial-report-settings.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsCostAnomaly, type AnomalySeverity, type AnomalyStatus } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsExchangeRate } from '../../db/entites/finops-exchange-rate.entity';
import { FinopsUsdQuote } from '../../db/entites/finops-usd-quote.entity';
import { Tenant } from '../../db/entites/tenant.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import { escapeHtml } from '../../mailer/email-layout';
import { MailerService } from '../../mailer/mailer.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AwsFinopsProvider } from '../providers/aws-finops.provider';
import { AzureFinopsProvider } from '../providers/azure-finops.provider';
import { GcpFinopsProvider } from '../providers/gcp-finops.provider';
import type { FinopsCostEntry } from '../providers/finops-provider.interface';
import { FinopsCostIngestionService } from './finops-cost-ingestion.service';
import { FinopsCommitmentsService } from './finops-commitments.service';
import {
    buildCommercialReport,
    isClosedMonth,
    isCommercialAutoSendDay,
    monthBounds,
    previousClosedMonth,
    saoPauloToday,
    shiftMonth,
    type CommercialReportModel,
    type CostGrain,
    type ResourceCostRow,
    type ServiceCostRow,
    type AccountForecastInput,
} from '../commercial-report.aggregate';
import { fetchUsdBrlQuote, type UsdBrlQuote } from '../usd-brl-quote';
import { buildCommercialReportPdf, commercialReportPdfFileName } from '../commercial-report.pdf';

const RESOURCE_BACKFILL_MS = 15 * 60 * 1000;
const resourceBackfillAt = new Map<string, number>();

const RESOURCE_NAME_SQL = `CASE WHEN strpos(cr.resource_id, '/') > 0 THEN regexp_replace(cr.resource_id, '^.*/', '') ELSE cr.resource_id END`;
const RESOURCE_SOURCE_SQL = `CASE WHEN cr.usage_type <> '' THEN 'usage' ELSE 'resource' END`;

export type CommercialAnomalyItem = {
    service: string;
    accountAlias: string;
    provider: string;
    date: string;
    severity: AnomalySeverity;
    status: AnomalyStatus;
    impact: number;
};

export type CommercialAnomalies = {
    total: number;
    acknowledged: number;
    items: CommercialAnomalyItem[];
};

export type CommercialCredits = {
    hasCredits: boolean;
    granted: number;
    consumed: number;
    remaining: number;
    /** Custo total do relatório não abate estes créditos promocionais. */
    deductedFromTotal: false;
};

export type CommercialCommitments = {
    hasData: boolean;
    avgUtilizationPercent: number | null;
    avgCoveragePercent: number | null;
    unusedCommitment: number | null;
    potentialMonthlySavings: number | null;
    savingsPlanCount: number;
    reservationCount: number;
    cudCount: number;
};

export type CommercialReportResponse = CommercialReportModel & {
    tenantName: string;
    organizationName: string;
    organizationNames: string[];
    generatedAt: string;
    anomalies: CommercialAnomalies;
    credits: CommercialCredits;
    commitments: CommercialCommitments;
    delivery: {
        enabled: boolean;
        emails: string[];
        alertChannels: Array<'email' | 'whatsapp'>;
        alertNotificationGroupIds: string[];
        currency: 'USD' | 'BRL';
        lastSentAt: string | null;
    };
};

@Injectable()
export class FinopsCommercialReportService implements OnModuleInit {
    private readonly logger = new Logger(FinopsCommercialReportService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(Organization)
        private readonly organizationRepo: Repository<Organization>,
        @InjectRepository(FinopsExchangeRate)
        private readonly exchangeRateRepo: Repository<FinopsExchangeRate>,
        @InjectRepository(FinopsUsdQuote)
        private readonly usdQuoteRepo: Repository<FinopsUsdQuote>,
        @InjectRepository(FinopsCostAnomaly)
        private readonly anomalyRepo: Repository<FinopsCostAnomaly>,
        @InjectRepository(FinopsCommercialReportSettings)
        private readonly settingsRepo: Repository<FinopsCommercialReportSettings>,
        @InjectRepository(FinopsCommercialReportSend)
        private readonly sendRepo: Repository<FinopsCommercialReportSend>,
        private readonly mailerService: MailerService,
        private readonly notificationsService: NotificationsService,
        private readonly configService: ConfigService,
        private readonly ingestionService: FinopsCostIngestionService,
        private readonly commitmentsService: FinopsCommitmentsService,
        private readonly awsProvider: AwsFinopsProvider,
        private readonly azureProvider: AzureFinopsProvider,
        private readonly gcpProvider: GcpFinopsProvider,
    ) {}

    onModuleInit(): void {
        void this.refreshDailyUsdQuote();
    }

    /** Busca USD-BRL na AwesomeAPI e grava a cotação do dia (America/Sao_Paulo). */
    async refreshDailyUsdQuote(): Promise<UsdBrlQuote | null> {
        const quotedOn = saoPauloToday();
        try {
            const quote = await fetchUsdBrlQuote();
            if (!quote) return this.readLatestUsdQuote();
            await this.usdQuoteRepo.upsert(
                {
                    quotedOn,
                    brlPerUsd: quote.bid,
                    pctChange: quote.pctChange,
                    quotedAt: quote.quotedAt,
                },
                { conflictPaths: ['quotedOn'] },
            );
            this.logger.log(`[FinOps Comercial] USD-BRL ${quotedOn}: ${quote.bid}`);
            return quote;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`[FinOps Comercial] Cotação USD-BRL indisponível: ${message}`);
            try {
                return await this.readLatestUsdQuote();
            } catch (readError: unknown) {
                const detail = readError instanceof Error ? readError.message : String(readError);
                this.logger.warn(`[FinOps Comercial] Cotação salva indisponível: ${detail}`);
                return null;
            }
        }
    }

    resolveMonth(month?: string): string {
        const today = saoPauloToday();
        const resolved = month?.trim() || previousClosedMonth(today);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(resolved) || !isClosedMonth(resolved, today)) {
            throw new BadRequestException(ErrorMessages.FINOPS.COMMERCIAL_REPORT_MONTH_OPEN);
        }
        return resolved;
    }

    async getReport(organizationId: string, month?: string): Promise<CommercialReportResponse> {
        const referenceMonth = this.resolveMonth(month);
        const report = await this.compose(organizationId, referenceMonth);
        const [settings, lastSend, tenant, organizations, anomalies, credits, commitments] = await Promise.all([
            this.settingsRepo.findOne({ where: { organizationId } }),
            this.sendRepo.findOne({ where: { organizationId, month: referenceMonth } }),
            this.tenantRepo.findOne({ where: { id: organizationId } }),
            this.organizationRepo.find({ where: { tenantId: organizationId }, order: { name: 'ASC' } }),
            this.loadMonthAnomalies(organizationId, report),
            this.loadCredits(organizationId, report),
            this.loadCommitments(organizationId, report),
        ]);
        const tenantName = tenant?.name?.trim() ?? '';
        const organizationNames = [...new Set(organizations.map((organization) => organization.name.trim()).filter(Boolean))];

        return {
            ...report,
            tenantName,
            organizationName: tenantName,
            organizationNames,
            generatedAt: new Date().toISOString(),
            anomalies,
            credits,
            commitments,
            delivery: {
                enabled: settings?.enabled ?? false,
                emails: settings?.emails ?? [],
                alertChannels: settings?.alertChannels ?? [],
                alertNotificationGroupIds: settings?.alertNotificationGroupIds ?? [],
                currency: settings?.currency === 'USD' ? 'USD' : 'BRL',
                lastSentAt: lastSend?.sentAt?.toISOString() ?? null,
            },
        };
    }

    async saveExchangeRate(organizationId: string, month: string, brlPerUsd: number): Promise<{ month: string; brlPerUsd: number }> {
        const referenceMonth = this.resolveMonth(month);
        if (!Number.isFinite(brlPerUsd) || brlPerUsd <= 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.COMMERCIAL_REPORT_RATE_INVALID);
        }
        await this.exchangeRateRepo.upsert(
            {
                organizationId,
                month: `${referenceMonth}-01`,
                brlPerUsd,
            },
            { conflictPaths: ['organizationId', 'month'] },
        );
        return { month: referenceMonth, brlPerUsd };
    }

    async saveDelivery(
        organizationId: string,
        enabled: boolean,
        input: {
            emails?: string[];
            alertChannels?: Array<'email' | 'whatsapp'>;
            alertNotificationGroupIds?: string[];
            currency?: 'USD' | 'BRL';
        },
    ): Promise<{ enabled: boolean; emails: string[]; alertChannels: Array<'email' | 'whatsapp'>; alertNotificationGroupIds: string[]; currency: 'USD' | 'BRL' }> {
        const channels = normalizeChannels(input.alertChannels ?? []);
        const usesGroups = input.alertNotificationGroupIds != null || channels.length > 0;
        const groupIds = usesGroups
            ? await this.normalizeGroups(organizationId, enabled, channels, input.alertNotificationGroupIds ?? [])
            : [];
        const emails = usesGroups ? [] : normalizeEmails(input.emails ?? []);
        const currency: 'USD' | 'BRL' = input.currency === 'USD' ? 'USD' : 'BRL';
        if (enabled && !usesGroups && emails.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.COMMERCIAL_REPORT_EMAILS_REQUIRED);
        }
        await this.settingsRepo.upsert(
            { organizationId, enabled, emails, alertChannels: channels, alertNotificationGroupIds: groupIds, currency },
            { conflictPaths: ['organizationId'] },
        );
        return { enabled, emails, alertChannels: channels, alertNotificationGroupIds: groupIds, currency };
    }

    async renderPdf(
        organizationId: string,
        month?: string,
        currency?: 'USD' | 'BRL',
        locale?: 'pt' | 'en',
    ): Promise<{ buffer: Buffer; filename: string }> {
        const report = await this.getReport(organizationId, month);
        const buffer = await buildCommercialReportPdf(report, { currency, locale });
        return { buffer, filename: commercialReportPdfFileName(report.organizationName, report.referenceMonth) };
    }

    async sendNow(organizationId: string, month?: string): Promise<{ month: string; recipients: string[] }> {
        const referenceMonth = this.resolveMonth(month);
        const settings = await this.settingsRepo.findOne({ where: { organizationId } });
        const recipients = await this.resolveRecipients(organizationId, settings);
        if (recipients.emails.length === 0 && !recipients.whatsapp) {
            throw new BadRequestException(ErrorMessages.FINOPS.COMMERCIAL_REPORT_RECIPIENTS_REQUIRED);
        }
        await this.deliver(organizationId, referenceMonth, recipients, settings?.currency);
        return { month: referenceMonth, recipients: recipients.emails };
    }

    async sendScheduledReports(): Promise<void> {
        const today = saoPauloToday();
        if (!isCommercialAutoSendDay(today)) return;
        const month = previousClosedMonth(today);
        const settings = await this.settingsRepo.find({ where: { enabled: true } });
        for (const setting of settings) {
            const recipients = await this.resolveRecipients(setting.organizationId, setting);
            if (recipients.emails.length === 0 && !recipients.whatsapp) continue;
            const already = await this.sendRepo.findOne({ where: { organizationId: setting.organizationId, month } });
            if (already) continue;
            try {
                await this.deliver(setting.organizationId, month, recipients, setting.currency);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`[FinOps Comercial] Falha ao enviar ${month} para ${setting.organizationId}: ${message}`);
            }
        }
    }

    private async deliver(
        organizationId: string,
        month: string,
        recipients: { emails: string[]; whatsapp: boolean; groupIds: string[] },
        preferredCurrency?: string | null,
    ): Promise<void> {
        const report = await this.getReport(organizationId, month);
        const currency = resolveDeliveryCurrency(report, preferredCurrency);
        const lines = renderReportLines(report, reportLink(this.configService, report.referenceMonth), currency);
        const summary = lines.join('\n');
        const pdf = await buildCommercialReportPdf(report, { currency });
        const filename = commercialReportPdfFileName(report.organizationName, month);
        let delivered = false;
        if (recipients.emails.length > 0) {
            await this.mailerService.sendCommercialReport({
                to: recipients.emails,
                organizationName: report.tenantName || report.organizationName,
                monthLabel: monthLabel(month),
                month,
                bodyHtml: renderReportEmail(summary),
                pdf: { filename, content: pdf },
            });
            delivered = true;
        }
        if (recipients.whatsapp) {
            const reportUrl = reportLink(this.configService, report.referenceMonth);
            const result = await this.notificationsService.sendWhatsappDocumentToGroups(
                organizationId,
                recipients.groupIds,
                {
                    text: summary,
                    linkPreview: isPublicReportUrl(reportUrl),
                    caption: '📎 *PDF do relatório de FinOps*',
                    filename,
                    mimetype: 'application/pdf',
                    content: pdf,
                },
            );
            if (result.sent > 0) delivered = true;
            else this.logger.warn(`[FinOps Comercial] WhatsApp sem entrega para ${organizationId} (${month})`);
        }
        if (!delivered) {
            throw new BadRequestException(ErrorMessages.FINOPS.COMMERCIAL_REPORT_RECIPIENTS_REQUIRED);
        }
        await this.sendRepo.upsert(
            {
                organizationId,
                month,
                sentAt: new Date(),
                recipientCount: recipients.emails.length + (recipients.whatsapp ? 1 : 0),
            },
            { conflictPaths: ['organizationId', 'month'] },
        );
    }

    private async resolveRecipients(
        organizationId: string,
        settings: FinopsCommercialReportSettings | null,
    ): Promise<{ emails: string[]; whatsapp: boolean; groupIds: string[] }> {
        const channels = normalizeChannels(settings?.alertChannels ?? []);
        const groupIds = settings?.alertNotificationGroupIds ?? [];
        if (channels.length > 0 && groupIds.length > 0) {
            const emails = channels.includes('email')
                ? await this.notificationsService.listActiveEmailsFromGroups(organizationId, groupIds)
                : [];
            return { emails, whatsapp: channels.includes('whatsapp'), groupIds };
        }
        return { emails: normalizeEmails(settings?.emails ?? []), whatsapp: false, groupIds: [] };
    }

    private async normalizeGroups(
        organizationId: string,
        enabled: boolean,
        channels: Array<'email' | 'whatsapp'>,
        groupIds: string[],
    ): Promise<string[]> {
        const uniqueIds = [...new Set(groupIds.filter(Boolean))];
        if (!enabled) return uniqueIds;
        if (channels.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.ANOMALY_ALERT_CHANNEL_REQUIRED);
        }
        const groups = await this.notificationsService.findGroupsByIds(organizationId, uniqueIds);
        if (groups.length !== uniqueIds.length) {
            throw new BadRequestException(ErrorMessages.FINOPS.INVALID_NOTIFICATION_GROUPS);
        }
        const emailIds = groups.filter((group) => group.channel === 'email').map((group) => group.id);
        const whatsappIds = groups.filter((group) => group.channel === 'whatsapp').map((group) => group.id);
        if (channels.includes('email') && emailIds.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.EMAIL_NOTIFICATION_GROUP_REQUIRED);
        }
        if (channels.includes('whatsapp') && whatsappIds.length === 0) {
            throw new BadRequestException(ErrorMessages.FINOPS.WHATSAPP_NOTIFICATION_GROUP_REQUIRED);
        }
        return [...new Set([...(channels.includes('email') ? emailIds : []), ...(channels.includes('whatsapp') ? whatsappIds : [])])];
    }


    private async compose(organizationId: string, referenceMonth: string): Promise<CommercialReportModel> {
        const oldest = monthBounds(shiftMonth(referenceMonth, -2));
        const today = saoPauloToday();
        const current = monthBounds(today.slice(0, 7));
        const end = current.end > oldest.end ? current.end : oldest.end;
        const resourceStart = monthBounds(shiftMonth(referenceMonth, -1)).start;
        const resourceEnd = monthBounds(referenceMonth).end;
        await this.ensureResourceCosts(organizationId, resourceStart, resourceEnd);
        const [accounts, serviceRows, resourceRows, quote, accountForecasts] = await Promise.all([
            this.cloudAccountRepo.find({ where: { tenantId: organizationId }, order: { alias: 'ASC' } }),
            this.loadServiceRows(organizationId, oldest.start, end),
            this.loadResourceRows(organizationId, resourceStart, resourceEnd),
            this.loadUsdBrlQuote(),
            this.loadAccountForecasts(organizationId),
        ]);

        return buildCommercialReport({
            referenceMonth,
            todayIso: today,
            accounts: accounts.map((account) => ({
                id: account.id,
                alias: account.alias,
                provider: account.provider,
            })),
            serviceRows,
            resourceRows,
            exchangeRate: quote?.bid ?? null,
            previousExchangeRate: null,
            exchangeRateChangePct: quote?.pctChange ?? null,
            accountForecasts,
        });
    }

    private async loadMonthAnomalies(organizationId: string, report: CommercialReportModel): Promise<CommercialAnomalies> {
        const bounds = monthBounds(report.referenceMonth);
        const rows = await this.anomalyRepo
            .createQueryBuilder('anomaly')
            .leftJoinAndSelect('anomaly.cloudAccount', 'account')
            .where('anomaly.organizationId = :organizationId', { organizationId })
            .andWhere('anomaly.anomalyDate >= :start', { start: bounds.start })
            .andWhere('anomaly.anomalyDate <= :end', { end: bounds.end })
            .orderBy('anomaly.financialImpact', 'DESC')
            .getMany();

        return {
            total: rows.length,
            acknowledged: rows.filter((row) => row.status === 'acknowledged').length,
            items: rows.slice(0, 25).map((row) => ({
                service: row.service,
                accountAlias: row.cloudAccount?.alias ?? '',
                provider: row.cloudProvider,
                date: calendarDate(row.anomalyDate),
                severity: row.severity,
                status: row.status,
                impact: this.toDisplay(Number(row.financialImpact), row.currency, report),
            })),
        };
    }

    private async loadCredits(organizationId: string, report: CommercialReportModel): Promise<CommercialCredits> {
        const bounds = monthBounds(report.referenceMonth);
        const credits = await this.commitmentsService.listCredits(organizationId, {
            periodStart: bounds.start,
            periodEnd: bounds.end,
        });
        const currency = String(credits.totals.currency || 'USD');
        const granted = this.toDisplay(Number(credits.totals.totalGranted), currency, report);
        const remaining = this.toDisplay(Number(credits.totals.totalRemaining), currency, report);
        const consumed = this.toDisplay(Number(credits.totals.consumedInPeriod), currency, report);
        return {
            hasCredits: granted > 0 || remaining > 0 || consumed > 0,
            granted,
            consumed,
            remaining,
            deductedFromTotal: false,
        };
    }

    private async loadCommitments(organizationId: string, report: CommercialReportModel): Promise<CommercialCommitments> {
        const [overview, utilization] = await Promise.all([
            this.commitmentsService.getOverview(organizationId),
            this.commitmentsService.listUtilization(organizationId),
        ]);
        const currency = String(overview.commitments.currency || 'USD');
        const items = utilization.items.filter((item) => !item.externalId.includes('aggregate'));
        return {
            hasData: items.length > 0 || overview.commitments.eligibleRecommendations > 0,
            avgUtilizationPercent: overview.commitments.avgUtilizationPercent,
            avgCoveragePercent: overview.commitments.avgCoveragePercent,
            unusedCommitment:
                overview.commitments.unusedCommitment == null
                    ? null
                    : this.toDisplay(Number(overview.commitments.unusedCommitment), currency, report),
            potentialMonthlySavings:
                overview.commitments.potentialMonthlySavings > 0
                    ? this.toDisplay(Number(overview.commitments.potentialMonthlySavings), currency, report)
                    : null,
            savingsPlanCount: items.filter((item) => item.commitmentType === 'savings_plan').length,
            reservationCount: items.filter((item) => item.commitmentType === 'reservation').length,
            cudCount: items.filter((item) => item.commitmentType === 'cud').length,
        };
    }

    private toDisplay(amount: number, currency: string, report: CommercialReportModel): number {
        if (!Number.isFinite(amount)) return 0;
        const source = currency.toUpperCase();
        const target = report.displayCurrency.toUpperCase();
        if (source === target) return amount;
        const rate = report.exchangeRate;
        if (rate == null || rate <= 0) return amount;
        if (source === 'USD' && target === 'BRL') return amount * rate;
        if (source === 'BRL' && target === 'USD') return amount / rate;
        return amount;
    }

    private async loadAccountForecasts(organizationId: string): Promise<AccountForecastInput[]> {
        const accounts = await this.cloudAccountRepo
            .createQueryBuilder('ca')
            .addSelect('ca.credentialsEncrypted')
            .where('ca.tenantId = :organizationId', { organizationId })
            .andWhere('ca.isActive = true')
            .andWhere('ca.provider IN (:...providers)', { providers: ['aws', 'azure'] })
            .getMany();

        const forecasts = await Promise.all(
            accounts.map(async (account) => {
                if (!account.credentialsEncrypted) return null;
                try {
                    const credentials = this.decryptCloudCredentials(account.credentialsEncrypted);
                    const creds = { credentials, cloudAccountId: account.id };
                    const forecast =
                        account.provider === 'aws'
                            ? await this.awsProvider.forecastMonthEnd(creds)
                            : await this.azureProvider.forecastMonthEnd(creds);
                    return {
                        accountId: account.id,
                        amount: forecast.amount,
                        currency: forecast.currency.toUpperCase(),
                    };
                } catch (error) {
                    this.logger.warn(
                        `[CommercialReport] Forecast de ${account.provider} ${account.id} indisponível: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    );
                    return null;
                }
            }),
        );
        return forecasts.filter((item): item is AccountForecastInput => item != null);
    }

    private async ensureResourceCosts(organizationId: string, start: string, end: string): Promise<void> {
        const accounts = await this.cloudAccountRepo
            .createQueryBuilder('ca')
            .addSelect('ca.credentialsEncrypted')
            .where('ca.tenantId = :organizationId', { organizationId })
            .andWhere('ca.isActive = true')
            .getMany();

        await Promise.all(
            accounts.map(async (account) => {
                if (!account.credentialsEncrypted) return;
                if (await this.hasClosedResourceDetail(organizationId, account.id, account.provider, start, end)) return;
                const attemptKey = `${account.id}:${start}:${end}`;
                const attemptedAt = resourceBackfillAt.get(attemptKey) ?? 0;
                if (Date.now() - attemptedAt < RESOURCE_BACKFILL_MS) return;

                try {
                    const credentials = this.decryptCloudCredentials(account.credentialsEncrypted);
                    const creds = { credentials, cloudAccountId: account.id };
                    let entries: FinopsCostEntry[] = [];
                    if (account.provider === 'aws') {
                        entries = (await this.awsProvider.collectUsageTypeCosts(creds, start, end)).entries;
                    } else if (account.provider === 'azure') {
                        entries = (await this.azureProvider.collectResourceCosts(creds, start, end, 'MONTHLY')).entries;
                    } else if (account.provider === 'gcp') {
                        entries = (await this.gcpProvider.collectResourceCosts(creds, start, end, 'MONTHLY')).entries;
                    }
                    if (entries.length === 0) return;
                    await this.ingestionService.ingest(
                        organizationId,
                        account.id,
                        account.provider,
                        start,
                        end,
                        'MONTHLY',
                        entries,
                        'manual',
                    );
                    this.logger.log(`[FinOps Comercial] ${entries.length} recursos gravados para ${account.alias} (${start} → ${end})`);
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.logger.warn(`[FinOps Comercial] Recursos de ${account.alias} indisponíveis: ${message}`);
                } finally {
                    resourceBackfillAt.set(attemptKey, Date.now());
                }
            }),
        );
    }

    private async hasClosedResourceDetail(
        organizationId: string,
        cloudAccountId: string,
        provider: string,
        start: string,
        end: string,
    ): Promise<boolean> {
        if (provider === 'aws') {
            const months = monthsInRange(start, end);
            const rows = await this.costRecordRepo
                .createQueryBuilder('cr')
                .select(`DISTINCT to_char(cr."date", 'YYYY-MM')`, 'month')
                .where('cr.organizationId = :organizationId', { organizationId })
                .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
                .andWhere('cr.date >= :start', { start })
                .andWhere('cr.date <= :end', { end })
                .andWhere('cr.granularity = :granularity', { granularity: 'monthly' })
                .andWhere(`cr.usageType <> ''`)
                .andWhere(`cr.resourceId <> ''`)
                .getRawMany<{ month: string }>();
            const covered = new Set(rows.map((row) => String(row.month).slice(0, 7)));
            return months.every((month) => covered.has(month));
        }

        const already = await this.costRecordRepo
            .createQueryBuilder('cr')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start })
            .andWhere('cr.date <= :end', { end })
            .andWhere(`cr.resourceId <> ''`)
            .getCount();
        return already > 0;
    }

    private decryptCloudCredentials(encrypted: string): Record<string, unknown> {
        const keyHex = this.configService.get<string>('CREDENTIALS_ENCRYPTION_KEY');
        if (!keyHex) throw new Error('CREDENTIALS_ENCRYPTION_KEY não configurada');
        const key = Buffer.from(keyHex, 'hex');
        if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY inválida');
        const combined = Buffer.from(encrypted, 'base64').toString('utf8');
        const [ivHex, authTagHex, ciphertext] = combined.split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        return JSON.parse(decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8')) as Record<string, unknown>;
    }

    private async loadUsdBrlQuote(): Promise<UsdBrlQuote | null> {
        const today = await this.usdQuoteRepo.findOne({ where: { quotedOn: saoPauloToday() } });
        if (today) return this.toUsdQuote(today);
        return this.readLatestUsdQuote();
    }

    private async readLatestUsdQuote(): Promise<UsdBrlQuote | null> {
        const row = await this.usdQuoteRepo.createQueryBuilder('q').orderBy('q.quotedOn', 'DESC').getOne();
        return row ? this.toUsdQuote(row) : null;
    }

    private toUsdQuote(row: FinopsUsdQuote): UsdBrlQuote {
        const pctChange = row.pctChange == null ? null : Number(row.pctChange);
        return {
            bid: Number(row.brlPerUsd),
            pctChange: pctChange != null && Number.isFinite(pctChange) ? pctChange : null,
            quotedAt: row.quotedAt,
        };
    }

    private async loadServiceRows(organizationId: string, start: string, end: string): Promise<ServiceCostRow[]> {
        const rows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.cloudAccountId', 'accountId')
            .addSelect('cr.cloudProvider', 'provider')
            .addSelect('cr.service', 'service')
            .addSelect(`to_char(cr."date", 'YYYY-MM-DD')`, 'day')
            .addSelect(`to_char(cr."date", 'YYYY-MM')`, 'month')
            .addSelect('cr.currency', 'currency')
            .addSelect('cr.granularity', 'granularity')
            .addSelect('SUM(cr.cost)', 'cost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.date >= :start', { start })
            .andWhere('cr.date <= :end', { end })
            .andWhere(`(cr.resourceId = '' OR cr.resourceId IS NULL)`)
            .groupBy('cr.cloudAccountId')
            .addGroupBy('cr.cloudProvider')
            .addGroupBy('cr.service')
            .addGroupBy(`to_char(cr."date", 'YYYY-MM-DD')`)
            .addGroupBy(`to_char(cr."date", 'YYYY-MM')`)
            .addGroupBy('cr.currency')
            .addGroupBy('cr.granularity')
            .getRawMany<{
                accountId: string;
                provider: string;
                service: string;
                day: string;
                month: string;
                currency: string;
                granularity: CostGrain;
                cost: string;
            }>();

        return rows.map((row) => ({
            accountId: row.accountId,
            provider: row.provider,
            service: row.service,
            day: String(row.day).slice(0, 10),
            month: String(row.month).slice(0, 7),
            currency: row.currency,
            granularity: row.granularity,
            cost: Number(row.cost),
        }));
    }

    private async loadResourceRows(organizationId: string, start: string, end: string): Promise<ResourceCostRow[]> {
        const rows = await this.costRecordRepo
            .createQueryBuilder('cr')
            .select(RESOURCE_NAME_SQL, 'name')
            .addSelect('cr.service', 'service')
            .addSelect(`to_char(cr."date", 'YYYY-MM')`, 'month')
            .addSelect('cr.currency', 'currency')
            .addSelect('cr.granularity', 'granularity')
            .addSelect(RESOURCE_SOURCE_SQL, 'source')
            .addSelect('SUM(cr.cost)', 'cost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.date >= :start', { start })
            .andWhere('cr.date <= :end', { end })
            .andWhere(`cr.resourceId IS NOT NULL AND cr.resourceId <> ''`)
            .groupBy(RESOURCE_NAME_SQL)
            .addGroupBy('cr.service')
            .addGroupBy(`to_char(cr."date", 'YYYY-MM')`)
            .addGroupBy('cr.currency')
            .addGroupBy('cr.granularity')
            .addGroupBy(RESOURCE_SOURCE_SQL)
            .getRawMany<{
                name: string;
                service: string;
                month: string;
                currency: string;
                granularity: CostGrain;
                source: 'usage' | 'resource';
                cost: string;
            }>();

        return rows.map((row) => ({
            name: row.name,
            service: row.service,
            month: String(row.month).slice(0, 7),
            currency: row.currency,
            granularity: row.granularity,
            source: row.source === 'usage' ? 'usage' : 'resource',
            cost: Number(row.cost),
        }));
    }
}

function monthsInRange(start: string, end: string): string[] {
    const months: string[] = [];
    let cursor = start.slice(0, 7);
    const last = end.slice(0, 7);
    while (cursor <= last) {
        months.push(cursor);
        cursor = shiftMonth(cursor, 1);
    }
    return months;
}

function normalizeChannels(channels: Array<'email' | 'whatsapp'>): Array<'email' | 'whatsapp'> {
    return [...new Set(channels.filter((channel) => channel === 'email' || channel === 'whatsapp'))];
}

function normalizeEmails(emails: string[]): string[] {
    return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter((email) => email.includes('@')))];
}

function monthLabel(month: string): string {
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${month}-01T12:00:00Z`),
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function calendarDate(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatMoney(value: number, currency: string): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

type ReportCurrency = 'USD' | 'BRL';

function sourceCurrency(report: CommercialReportResponse): ReportCurrency {
    return report.displayCurrency === 'USD' ? 'USD' : 'BRL';
}

function resolveDeliveryCurrency(report: CommercialReportResponse, preferred?: string | null): ReportCurrency {
    const source = sourceCurrency(report);
    const wanted: ReportCurrency = preferred === 'USD' ? 'USD' : preferred === 'BRL' ? 'BRL' : source;
    if (wanted === source) return wanted;
    return report.exchangeRate != null && report.exchangeRate > 0 ? wanted : source;
}

function convertAmount(value: number, report: CommercialReportResponse, target: ReportCurrency): number {
    const source = sourceCurrency(report);
    const rate = report.exchangeRate;
    if (!Number.isFinite(value)) return 0;
    if (source === target || rate == null || rate <= 0) return value;
    if (source === 'USD' && target === 'BRL') return value * rate;
    if (source === 'BRL' && target === 'USD') return value / rate;
    return value;
}

function moneyIn(report: CommercialReportResponse, value: number, target: ReportCurrency): string {
    return formatMoney(convertAmount(value, report, target), target);
}

function projectionOrigin(source: CommercialReportModel['kpis']['projectionSource']): string {
    if (source === 'provider') return 'previsão do provedor';
    if (source === 'mixed') return 'parte linear';
    return 'projeção linear';
}

function reportLink(configService: ConfigService, month: string): string {
    const configured = (configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').trim().replace(/\/$/, '');
    const base = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    const monthParam = /^\d{4}-\d{2}$/.test(month) ? month : encodeURIComponent(month);
    return `${base}/finops/reports/commercial?month=${monthParam}`;
}

function isPublicReportUrl(link: string): boolean {
    try {
        const url = new URL(link);
        const host = url.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) return false;
        return host.includes('.') && (url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
        return false;
    }
}

function whatsappPlain(value: string): string {
    return value.replace(/[*_~`]/g, '').trim();
}

function renderReportLines(report: CommercialReportResponse, link: string, currency: ReportCurrency): string[] {
    const money = (value: number) => moneyIn(report, value, currency);
    const projectionMonth = monthLabel(report.kpis.projectionMonth);
    const projection =
        report.kpis.projection != null
            ? `📈 *Projeção (${whatsappPlain(projectionMonth)}):* ${money(report.kpis.projection)}\n_${whatsappPlain(projectionOrigin(report.kpis.projectionSource))}_`
            : `📈 *Projeção (${whatsappPlain(projectionMonth)}):* sem base suficiente`;
    const credits = report.credits.hasCredits
        ? [
              '💳 *Créditos*',
              `• Créditos concedidos: *${money(report.credits.granted)}*`,
              `• Créditos consumidos: *${money(report.credits.consumed)}*`,
              `• Créditos restantes: *${money(report.credits.remaining)}*`,
              '_O custo total acima ainda não abate esses créditos._',
          ].join('\n')
        : '💳 *Créditos:* nenhum crédito ativo';
    const commitments = renderCommitmentsLines(report, money);
    const exchange =
        currency === 'BRL' && report.exchangeRate != null
            ? `💱 *Cotação:* ${report.exchangeRate.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} BRL/USD`
            : '';

    return [
        '📊 *Relatório de FinOps*',
        `🏢 *Tenant:* ${whatsappPlain(report.tenantName || report.organizationName)}`,
        ...(report.organizationNames.length > 0
            ? [`🏬 *Organização:* ${whatsappPlain(report.organizationNames.join(', '))}`]
            : []),
        `🗓️ *Período:* ${whatsappPlain(monthLabel(report.referenceMonth))}`,
        `💵 *Moeda:* ${currency === 'BRL' ? 'Real' : 'Dólar'}`,
        '',
        `💰 *Custo total:* ${money(report.kpis.totalCost)}`,
        '_Valor amortizado da nuvem. Não inclui abatimento de créditos promocionais._',
        `📅 *Média diária:* ${money(report.kpis.avgDailyCost)}`,
        `☁️ *Assinaturas com consumo:* ${report.kpis.accountsWithSpend} de ${report.kpis.accountsTotal}`,
        '',
        projection,
        '',
        `⚠️ *Anomalias no mês:* ${report.anomalies.total}`,
        `✅ *Reconhecidas:* ${report.anomalies.acknowledged}`,
        '',
        credits,
        '',
        commitments,
        ...(exchange ? ['', exchange] : []),
        '',
        '📎 O *PDF* completo segue nesta conversa.',
        '',
        '🔗 *Abrir no painel:*',
        link,
    ];
}

function formatPctLabel(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
}

function renderCommitmentsLines(
    report: CommercialReportResponse,
    money: (value: number) => string,
): string {
    const commitments = report.commitments;
    if (!commitments?.hasData) {
        return '🔐 *Reservas e Savings Plans:* sem dados sincronizados';
    }
    const inventory = [
        commitments.savingsPlanCount > 0 ? `${commitments.savingsPlanCount} Savings Plan` : null,
        commitments.reservationCount > 0 ? `${commitments.reservationCount} Reservation` : null,
        commitments.cudCount > 0 ? `${commitments.cudCount} CUD` : null,
    ].filter(Boolean);
    return [
        '🔐 *Reservas e Savings Plans*',
        ...(inventory.length > 0 ? [`• Ativos: *${inventory.join(' · ')}*`] : []),
        `• Utilização média: *${formatPctLabel(commitments.avgUtilizationPercent)}*`,
        `• Cobertura média: *${formatPctLabel(commitments.avgCoveragePercent)}*`,
        commitments.unusedCommitment != null
            ? `• Compromisso não usado: *${money(commitments.unusedCommitment)}*`
            : null,
        commitments.potentialMonthlySavings != null
            ? `• Economia potencial (sugestões): *${money(commitments.potentialMonthlySavings)}*`
            : null,
    ]
        .filter((line): line is string => line != null)
        .join('\n');
}

function renderReportEmail(summary: string): string {
    const lines = summary
        .replace('segue nesta conversa.', 'segue em anexo.')
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('🔗')) return false;
            if (/^https?:\/\//i.test(trimmed)) return false;
            return true;
        });
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

    return lines
        .map((line) => {
            if (!line.trim()) return '<div style="height:8px;line-height:8px;">&nbsp;</div>';
            return `<p style="margin:0 0 4px;font-size:14px;line-height:1.5;">${formatEmailLine(line)}</p>`;
        })
        .join('');
}

function formatEmailLine(line: string): string {
    const trimmed = line.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        const href = escapeHtml(trimmed);
        return `<a href="${href}" style="color:#2563EB;">${href}</a>`;
    }
    return escapeHtml(line).replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>');
}
