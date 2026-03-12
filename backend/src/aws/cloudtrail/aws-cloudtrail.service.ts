import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    DescribeTrailsCommand,
    GetTrailStatusCommand,
    ListTagsCommand,
    type Trail,
} from '@aws-sdk/client-cloudtrail';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsCloudTrailTrail, AwsVpc } from '../../db/entites';

@Injectable()
export class AwsCloudTrailService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsCloudTrailTrail)
        private readonly trailRepository: Repository<AwsCloudTrailTrail>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>
    ) {}

    async listTrailsFromDatabase(cloudAccountId: string) {
        const trails = await this.trailRepository
            .createQueryBuilder('trail')
            .leftJoinAndSelect('trail.vpc', 'vpc')
            .where('trail.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('trail.name', 'ASC')
            .getMany();

        return trails.map(mapDbTrail);
    }

    async getTrailById(trailId: string, cloudAccountId: string) {
        const trail = await this.trailRepository
            .createQueryBuilder('trail')
            .leftJoinAndSelect('trail.vpc', 'vpc')
            .where('trail.id = :trailId', { trailId })
            .andWhere('trail.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!trail) {
            throw new BadRequestException(`Trail CloudTrail com ID "${trailId}" não encontrada.`);
        }

        return mapDbTrail(trail);
    }

    async syncTrailsFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getCloudTrailClient(cloudAccountId, organizationId);

        const { trailList } = await client.send(new DescribeTrailsCommand({ includeShadowTrails: false })).catch(() => {
            throw new BadRequestException('Falha ao listar trails do CloudTrail. Verifique as permissões da role (cloudtrail:DescribeTrails).');
        });

        if (!trailList || trailList.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsTrail>[] = [];

        for (const trail of trailList) {
            if (!trail.TrailARN) continue;

            let isLogging = false;
            try {
                const status = await client.send(new GetTrailStatusCommand({ Name: trail.TrailARN }));
                isLogging = status.IsLogging ?? false;
            } catch {
                console.warn(`Não foi possível obter status da trail ${trail.Name}.`);
            }

            let tags: Record<string, string> = {};
            try {
                const { ResourceTagList } = await client.send(new ListTagsCommand({ ResourceIdList: [trail.TrailARN] }));
                tags = parseTags(ResourceTagList?.[0]?.TagsList);
            } catch {
                console.warn(`Não foi possível obter tags da trail ${trail.Name}.`);
            }

            const trailData = mapAwsTrail(trail, isLogging, tags);
            mapped.push(trailData);

            const vpc = trailData.awsVpcId
                ? await this.vpcRepository.findOne({ where: { cloudAccountId, awsVpcId: trailData.awsVpcId } })
                : null;

            let dbTrail = await this.trailRepository.findOne({ where: { trailArn: trailData.trailArn } });

            if (dbTrail) {
                dbTrail.name = trailData.name;
                dbTrail.s3BucketName = trailData.s3BucketName;
                dbTrail.s3KeyPrefix = trailData.s3KeyPrefix;
                dbTrail.isMultiRegionTrail = trailData.isMultiRegionTrail;
                dbTrail.isLogging = isLogging;
                dbTrail.homeRegion = trailData.homeRegion;
                dbTrail.isOrganizationTrail = trailData.isOrganizationTrail;
                dbTrail.logFileValidationEnabled = trailData.logFileValidationEnabled;
                dbTrail.snsTopicArn = trailData.snsTopicArn;
                dbTrail.cloudWatchLogsLogGroupArn = trailData.cloudWatchLogsLogGroupArn;
                dbTrail.awsVpcId = trailData.awsVpcId;
                dbTrail.vpcId = vpc?.id ?? null;
                dbTrail.lastSyncedAt = now;
            } else {
                dbTrail = this.trailRepository.create({
                    cloudAccountId,
                    ...trailData,
                    vpcId: vpc?.id ?? null,
                    lastSyncedAt: now,
                });
            }

            await this.trailRepository.save(dbTrail);
        }

        return mapped;
    }
}

function mapAwsTrail(trail: Trail, isLogging: boolean, tags: Record<string, string>) {
    return {
        trailArn: trail.TrailARN ?? '',
        name: trail.Name ?? '',
        s3BucketName: trail.S3BucketName ?? null,
        s3KeyPrefix: trail.S3KeyPrefix ?? null,
        isMultiRegionTrail: trail.IsMultiRegionTrail ?? false,
        isLogging,
        homeRegion: trail.HomeRegion ?? null,
        isOrganizationTrail: trail.IsOrganizationTrail ?? false,
        logFileValidationEnabled: trail.LogFileValidationEnabled ?? false,
        snsTopicArn: trail.SnsTopicARN ?? null,
        cloudWatchLogsLogGroupArn: trail.CloudWatchLogsLogGroupArn ?? null,
        awsVpcId: null as string | null,
        tags,
    };
}

function parseTags(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
    if (!tags) return {};
    return tags.reduce<Record<string, string>>((acc, { Key, Value }) => {
        if (Key) acc[Key] = Value ?? '';
        return acc;
    }, {});
}

function mapDbTrail(trail: AwsCloudTrailTrail) {
    return {
        id: trail.id,
        cloudAccountId: trail.cloudAccountId,
        trailArn: trail.trailArn,
        name: trail.name,
        s3BucketName: trail.s3BucketName,
        s3KeyPrefix: trail.s3KeyPrefix,
        isMultiRegionTrail: trail.isMultiRegionTrail,
        isLogging: trail.isLogging,
        homeRegion: trail.homeRegion,
        isOrganizationTrail: trail.isOrganizationTrail,
        logFileValidationEnabled: trail.logFileValidationEnabled,
        snsTopicArn: trail.snsTopicArn,
        cloudWatchLogsLogGroupArn: trail.cloudWatchLogsLogGroupArn,
        awsVpcId: trail.awsVpcId,
        vpcId: trail.vpcId,
        lastSyncedAt: trail.lastSyncedAt,
        createdAt: trail.createdAt,
        updatedAt: trail.updatedAt,
        vpc: trail.vpc
            ? { id: trail.vpc.id, awsVpcId: trail.vpc.awsVpcId, cidrBlock: trail.vpc.cidrBlock, state: trail.vpc.state }
            : null,
    };
}
