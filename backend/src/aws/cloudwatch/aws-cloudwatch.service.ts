import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    DescribeAlarmsCommand,
    type MetricAlarm,
} from '@aws-sdk/client-cloudwatch';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsCloudWatchAlarm } from '../../db/entites';

@Injectable()
export class AwsCloudWatchService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsCloudWatchAlarm)
        private readonly alarmRepository: Repository<AwsCloudWatchAlarm>
    ) {}

    async listAlarmsFromDatabase(cloudAccountId: string) {
        return this.alarmRepository.find({
            where: { cloudAccountId },
            order: { alarmName: 'ASC' },
        });
    }

    async getAlarmById(alarmId: string, cloudAccountId: string) {
        const alarm = await this.alarmRepository.findOne({ where: { id: alarmId, cloudAccountId } });

        if (!alarm) {
            throw new BadRequestException(`Alarme CloudWatch com ID "${alarmId}" não encontrado.`);
        }

        return alarm;
    }

    async syncAlarmsFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getCloudWatchClient(cloudAccountId, organizationId);

        const { MetricAlarms } = await client.send(new DescribeAlarmsCommand({ AlarmTypes: ['MetricAlarm'] })).catch(() => {
            throw new BadRequestException('Falha ao listar alarmes do CloudWatch. Verifique as permissões da role (cloudwatch:DescribeAlarms).');
        });

        if (!MetricAlarms || MetricAlarms.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsAlarm>[] = [];

        for (const alarm of MetricAlarms) {
            if (!alarm.AlarmArn) continue;

            const alarmData = mapAwsAlarm(alarm);
            mapped.push(alarmData);

            let dbAlarm = await this.alarmRepository.findOne({ where: { alarmArn: alarmData.alarmArn } });

            if (dbAlarm) {
                dbAlarm.alarmName = alarmData.alarmName;
                dbAlarm.alarmDescription = alarmData.alarmDescription;
                dbAlarm.stateValue = alarmData.stateValue;
                dbAlarm.stateReason = alarmData.stateReason;
                dbAlarm.namespace = alarmData.namespace;
                dbAlarm.metricName = alarmData.metricName;
                dbAlarm.comparisonOperator = alarmData.comparisonOperator;
                dbAlarm.threshold = alarmData.threshold;
                dbAlarm.period = alarmData.period;
                dbAlarm.evaluationPeriods = alarmData.evaluationPeriods;
                dbAlarm.statistic = alarmData.statistic;
                dbAlarm.alarmActions = alarmData.alarmActions;
                dbAlarm.dimensions = alarmData.dimensions;
                dbAlarm.lastSyncedAt = now;
            } else {
                dbAlarm = this.alarmRepository.create({
                    cloudAccountId,
                    ...alarmData,
                    lastSyncedAt: now,
                });
            }

            await this.alarmRepository.save(dbAlarm);
        }

        return mapped;
    }
}

function mapAwsAlarm(alarm: MetricAlarm) {
    return {
        alarmArn: alarm.AlarmArn ?? '',
        alarmName: alarm.AlarmName ?? '',
        alarmDescription: alarm.AlarmDescription ?? null,
        stateValue: alarm.StateValue ?? 'INSUFFICIENT_DATA',
        stateReason: alarm.StateReason ?? null,
        namespace: alarm.Namespace ?? null,
        metricName: alarm.MetricName ?? null,
        comparisonOperator: alarm.ComparisonOperator ?? null,
        threshold: alarm.Threshold ?? null,
        period: alarm.Period ?? null,
        evaluationPeriods: alarm.EvaluationPeriods ?? null,
        statistic: alarm.Statistic ?? null,
        alarmActions: alarm.AlarmActions ?? null,
        dimensions: alarm.Dimensions?.map((d) => ({ Name: d.Name ?? '', Value: d.Value ?? '' })) ?? null,
    };
}
