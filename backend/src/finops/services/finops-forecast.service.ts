import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';

import { CloudAccount } from '../../db/entites/cloud-account.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { AwsFinopsProvider } from '../providers/aws-finops.provider';
import { AzureFinopsProvider } from '../providers/azure-finops.provider';
import type { ProviderMonthForecast } from '../providers/finops-provider.interface';
import { andWhereServiceLevelCost } from '../utils/service-level-cost';

export interface ForecastResult {
    cloudAccountId: string;
    periodStart: string;
    periodEnd: string;
    forecastedCost: number;
    avgDailyCost: number;
    daysElapsed: number;
    daysRemaining: number;
    currency: string;
    confidence: 'low' | 'medium' | 'high';
    /** provider = número do Cost Explorer / Cost Management. linear = média local. */
    source: 'provider' | 'linear';
    provider: 'aws' | 'azure' | 'gcp' | null;
    byService: Array<{ service: string; forecastedCost: number }>;
}

export interface ForecastMonthProjection {
    month: string;
    forecastedCost: number;
    currency: string;
    source: 'provider' | 'linear';
}

@Injectable()
export class FinopsForecastService {
    private readonly logger = new Logger(FinopsForecastService.name);

    constructor(
        @InjectRepository(FinopsCostRecord)
        private readonly costRecordRepo: Repository<FinopsCostRecord>,
        @InjectRepository(CloudAccount)
        private readonly cloudAccountRepo: Repository<CloudAccount>,
        private readonly configService: ConfigService,
        private readonly awsProvider: AwsFinopsProvider,
        private readonly azureProvider: AzureFinopsProvider,
    ) {}

    /**
     * Fim do mês corrente. AWS e Azure usam o forecast do provedor;
     * o detalhe por serviço é a distribuição local reescalada para esse total.
     * GCP e falha de permissão caem na média diária.
     */
    async forecastCurrentMonth(organizationId: string, cloudAccountId: string): Promise<ForecastResult> {
        const linear = await this.linearCurrentMonth(organizationId, cloudAccountId);
        const account = await this.loadAccount(organizationId, cloudAccountId);
        const provider = account?.provider === 'aws' || account?.provider === 'azure' || account?.provider === 'gcp' ? account.provider : null;
        if (!account?.credentialsEncrypted || (provider !== 'aws' && provider !== 'azure')) {
            return { ...linear, source: 'linear', provider };
        }

        try {
            const credentials = this.decryptCloudCredentials(account.credentialsEncrypted);
            const creds = { credentials, cloudAccountId };
            const forecast = provider === 'aws' ? await this.awsProvider.forecastMonthEnd(creds) : await this.azureProvider.forecastMonthEnd(creds);
            const totalDays = Math.max(linear.daysElapsed + linear.daysRemaining, 1);
            this.logger.log(
                `[Forecast] ${provider} ${cloudAccountId}: previsão do provedor=${forecast.amount.toFixed(2)} ${forecast.currency}`,
            );
            return {
                ...linear,
                forecastedCost: forecast.amount,
                avgDailyCost: forecast.amount / totalDays,
                currency: forecast.currency || linear.currency,
                confidence: 'high',
                source: 'provider',
                provider,
                byService: scaleToTotal(linear.byService, forecast.amount),
            };
        } catch (error) {
            this.logger.warn(
                `[Forecast] ${provider} ${cloudAccountId} indisponível, usando projeção linear: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return { ...linear, source: 'linear', provider };
        }
    }

    /**
     * Próximos meses. A AWS devolve GetCostForecast mensal.
     * Azure e GCP ficam na média dos últimos 3 meses.
     */
    async forecastNextMonths(organizationId: string, cloudAccountId: string, months = 3): Promise<ForecastMonthProjection[]> {
        const count = Number.isFinite(months) && months > 0 ? Math.min(Math.trunc(months), 12) : 3;
        const account = await this.loadAccount(organizationId, cloudAccountId);
        if (account?.provider === 'aws' && account.credentialsEncrypted) {
            try {
                const credentials = this.decryptCloudCredentials(account.credentialsEncrypted);
                const upcoming = await this.awsProvider.forecastUpcomingMonths(
                    { credentials, cloudAccountId },
                    count,
                );
                if (upcoming.length > 0) return upcoming.slice(0, count).map(toProviderMonth);
            } catch (error) {
                this.logger.warn(
                    `[Forecast] Próximos meses AWS ${cloudAccountId} indisponíveis: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        const linear = await this.linearNextMonths(organizationId, cloudAccountId, count);
        return linear.map((row) => ({ ...row, source: 'linear' as const }));
    }

    private async linearCurrentMonth(organizationId: string, cloudAccountId: string): Promise<ForecastResult> {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;

        const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const today = now.toISOString().slice(0, 10);

        const lastDay = new Date(Date.UTC(year, month, 0));
        const periodEnd = lastDay.toISOString().slice(0, 10);
        const totalDays = lastDay.getUTCDate();

        const daysElapsed = now.getUTCDate();
        const daysRemaining = totalDays - daysElapsed;

        const totalQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStart })
            .andWhere('cr.date <= :today', { today })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(totalQb, 'cr');

        const result = await totalQb.groupBy('cr.currency').getRawOne<{ totalCost: string; currency: string }>();

        const totalSoFar = Number(result?.totalCost ?? 0);
        const currency = result?.currency ?? 'USD';
        const avgDailyCost = daysElapsed > 0 ? totalSoFar / daysElapsed : 0;
        const forecastedCost = avgDailyCost * totalDays;

        const serviceQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('cr.service', 'service')
            .addSelect('SUM(cr.cost)', 'totalCost')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :start', { start: periodStart })
            .andWhere('cr.date <= :today', { today })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(serviceQb, 'cr');

        const serviceRows = await serviceQb
            .groupBy('cr.service')
            .orderBy('"totalCost"', 'DESC')
            .limit(10)
            .getRawMany<{ service: string; totalCost: string }>();

        const byService = serviceRows.map((row) => ({
            service: row.service,
            forecastedCost: (Number(row.totalCost) / Math.max(daysElapsed, 1)) * totalDays,
        }));

        const confidence: ForecastResult['confidence'] = daysElapsed >= 14 ? 'high' : daysElapsed >= 7 ? 'medium' : 'low';

        return {
            cloudAccountId,
            periodStart,
            periodEnd,
            forecastedCost,
            avgDailyCost,
            daysElapsed,
            daysRemaining,
            currency,
            confidence,
            source: 'linear',
            provider: null,
            byService,
        };
    }

    private async linearNextMonths(
        organizationId: string,
        cloudAccountId: string,
        months: number,
    ): Promise<Array<{ month: string; forecastedCost: number; currency: string }>> {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
        const baseDate = threeMonthsAgo.toISOString().slice(0, 10);

        const baseQb = this.costRecordRepo
            .createQueryBuilder('cr')
            .select('SUM(cr.cost)', 'totalCost')
            .addSelect('cr.currency', 'currency')
            .where('cr.organizationId = :organizationId', { organizationId })
            .andWhere('cr.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .andWhere('cr.date >= :baseDate', { baseDate })
            .andWhere('cr.granularity = :gran', { gran: 'daily' });
        andWhereServiceLevelCost(baseQb, 'cr');

        const result = await baseQb.groupBy('cr.currency').getRawOne<{ totalCost: string; currency: string }>();

        const totalCost = Number(result?.totalCost ?? 0);
        const currency = result?.currency ?? 'USD';
        const avgMonthly = totalCost / 3;

        const projections: Array<{ month: string; forecastedCost: number; currency: string }> = [];
        const now = new Date();

        for (let i = 1; i <= months; i++) {
            const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
            const monthStr = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;
            projections.push({ month: monthStr, forecastedCost: avgMonthly, currency });
        }

        return projections;
    }

    private async loadAccount(organizationId: string, cloudAccountId: string): Promise<CloudAccount | null> {
        return this.cloudAccountRepo
            .createQueryBuilder('ca')
            .addSelect('ca.credentialsEncrypted')
            .where('ca.id = :cloudAccountId', { cloudAccountId })
            .andWhere('ca.tenantId = :organizationId', { organizationId })
            .getOne();
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
}

function scaleToTotal(
    rows: Array<{ service: string; forecastedCost: number }>,
    target: number,
): Array<{ service: string; forecastedCost: number }> {
    const current = rows.reduce((sum, row) => sum + row.forecastedCost, 0);
    if (current <= 0 || !Number.isFinite(target)) return rows;
    const factor = target / current;
    return rows.map((row) => ({ service: row.service, forecastedCost: row.forecastedCost * factor }));
}

function toProviderMonth(row: ProviderMonthForecast): ForecastMonthProjection {
    return { month: row.month, forecastedCost: row.amount, currency: row.currency, source: 'provider' };
}
