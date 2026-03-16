import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import {
    ListDetectorsCommand,
    GetDetectorCommand,
    ListTagsForResourceCommand,
    GetFindingsStatisticsCommand,
    FindingStatisticType,
} from '@aws-sdk/client-guardduty';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsGuardDutyDetector } from '../../db/entites';

@Injectable()
export class AwsGuardDutyService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsGuardDutyDetector)
        private readonly detectorRepository: Repository<AwsGuardDutyDetector>
    ) {}

    async listDetectorsFromDatabase(cloudAccountId: string) {
        return this.detectorRepository.find({ where: { cloudAccountId }, order: { detectorId: 'ASC' } });
    }

    async getDetectorById(detectorId: string, cloudAccountId: string) {
        const detector = await this.detectorRepository.findOne({ where: { id: detectorId, cloudAccountId } });

        if (!detector) {
            throw new BadRequestException(`Detector GuardDuty com ID "${detectorId}" não encontrado.`);
        }

        return detector;
    }

    async syncDetectorsFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getGuardDutyClient(cloudAccountId, organizationId);

        const { DetectorIds } = await client.send(new ListDetectorsCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar detectores do GuardDuty. Verifique as permissões da role (guardduty:ListDetectors).');
        });

        if (!DetectorIds || DetectorIds.length === 0) {
            return [];
        }

        const now = new Date();

        const mapped: Record<string, any>[] = [];

        for (const detectorId of DetectorIds) {
            const detector = await client.send(new GetDetectorCommand({ DetectorId: detectorId })).catch(() => {
                throw new BadRequestException(`Falha ao obter detector GuardDuty ${detectorId}. Verifique as permissões (guardduty:GetDetector).`);
            });

            let findingsCount: number | null = null;

            try {
                const { FindingStatistics } = await client.send(
                    new GetFindingsStatisticsCommand({
                        DetectorId: detectorId,

                        FindingStatisticTypes: [FindingStatisticType.COUNT_BY_SEVERITY],
                    })
                );

                if (FindingStatistics?.CountBySeverity) {
                    findingsCount = Object.values(FindingStatistics.CountBySeverity).reduce((sum, c) => sum + c, 0);
                }
            } catch {
                console.warn(`Não foi possível obter contagem de findings do detector ${detectorId}.`);
            }

            let tags: Record<string, string> = {};

            try {
                const arn = `arn:aws:guardduty:*:*:detector/${detectorId}`;

                const { Tags } = await client.send(new ListTagsForResourceCommand({ ResourceArn: arn }));

                tags = Tags ?? {};
            } catch {
                console.warn(`Não foi possível obter tags do detector ${detectorId}.`);
            }

            const detectorData = {
                detectorId,

                status: detector.Status ?? null,

                findingPublishingFrequency: detector.FindingPublishingFrequency ?? null,

                serviceRole: detector.ServiceRole ?? null,

                findingsCount,

                dataSources: detector.DataSources ? JSON.parse(JSON.stringify(detector.DataSources)) : null,

                features: detector.Features ? JSON.parse(JSON.stringify(detector.Features)) : null,

                createdAtAws: detector.CreatedAt ? new Date(detector.CreatedAt) : null,

                updatedAtAws: detector.UpdatedAt ? new Date(detector.UpdatedAt) : null,
            };

            mapped.push(detectorData);

            let dbDetector = await this.detectorRepository.findOne({ where: { detectorId } });

            if (dbDetector) {
                Object.assign(dbDetector, detectorData, { tags, lastSyncedAt: now });
            } else {
                dbDetector = this.detectorRepository.create({ cloudAccountId, ...detectorData, tags, lastSyncedAt: now });
            }

            await this.detectorRepository.save(dbDetector);
        }

        return mapped;
    }
}
