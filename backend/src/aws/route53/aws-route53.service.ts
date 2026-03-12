import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ListHostedZonesCommand,
    GetHostedZoneCommand,
    ListTagsForResourceCommand,
    type HostedZone,
} from '@aws-sdk/client-route-53';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsRoute53HostedZone, AwsVpc } from '../../db/entites';

@Injectable()
export class AwsRoute53Service {
    private readonly logger = new Logger(AwsRoute53Service.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsRoute53HostedZone)
        private readonly hostedZoneRepository: Repository<AwsRoute53HostedZone>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>
    ) {}

    async listHostedZonesFromDatabase(cloudAccountId: string) {
        const zones = await this.hostedZoneRepository
            .createQueryBuilder('zone')
            .leftJoinAndSelect('zone.vpc', 'vpc')
            .where('zone.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('zone.name', 'ASC')
            .getMany();

        return zones.map(mapDbHostedZone);
    }

    async getHostedZoneById(hostedZoneId: string, cloudAccountId: string) {
        const zone = await this.hostedZoneRepository
            .createQueryBuilder('zone')
            .leftJoinAndSelect('zone.vpc', 'vpc')
            .where('zone.id = :hostedZoneId', { hostedZoneId })
            .andWhere('zone.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!zone) {
            throw new BadRequestException(`Hosted Zone com ID "${hostedZoneId}" não encontrada.`);
        }

        return mapDbHostedZone(zone);
    }

    async syncHostedZonesFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getRoute53Client(cloudAccountId, organizationId);

        const { HostedZones } = await client.send(new ListHostedZonesCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar hosted zones do Route53. Verifique as permissões da role (route53:ListHostedZones).');
        });

        if (!HostedZones || HostedZones.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsHostedZone>[] = [];

        for (const hz of HostedZones) {
            if (!hz.Id) continue;

            const rawId = hz.Id.replace('/hostedzone/', '');

            let tagsRecord: Record<string, string> = {};
            try {
                const { ResourceTagSet } = await client.send(new ListTagsForResourceCommand({ ResourceType: 'hostedzone', ResourceId: rawId }));
                tagsRecord = parseTags(ResourceTagSet?.Tags);
            } catch {
                this.logger.debug(`Não foi possível obter tags da hosted zone ${rawId}.`);
            }

            let awsVpcId: string | null = null;
            try {
                const { VPCs } = await client.send(new GetHostedZoneCommand({ Id: hz.Id }));
                awsVpcId = VPCs?.[0]?.VPCId ?? null;
            } catch {
                this.logger.debug(`Não foi possível obter VPC da hosted zone ${rawId}.`);
            }

            const zoneData = mapAwsHostedZone(hz, tagsRecord, awsVpcId);
            mapped.push(zoneData);

            const vpc = awsVpcId
                ? await this.vpcRepository.findOne({ where: { cloudAccountId, awsVpcId } })
                : null;

            if (awsVpcId && !vpc) {
                this.logger.debug(`VPC ${awsVpcId} não encontrada no banco. Sincronize as VPCs primeiro.`);
            }

            let dbZone = await this.hostedZoneRepository.findOne({ where: { awsHostedZoneId: rawId } });

            if (dbZone) {
                dbZone.name = zoneData.name;
                dbZone.zoneType = zoneData.zoneType;
                dbZone.recordSetCount = zoneData.recordSetCount;
                dbZone.comment = zoneData.comment;
                dbZone.isPrivate = zoneData.isPrivate;
                dbZone.awsVpcId = awsVpcId;
                dbZone.vpcId = vpc?.id ?? null;
                dbZone.tags = zoneData.tags;
                dbZone.lastSyncedAt = now;
            } else {
                dbZone = this.hostedZoneRepository.create({
                    cloudAccountId,
                    awsHostedZoneId: rawId,
                    name: zoneData.name,
                    zoneType: zoneData.zoneType,
                    recordSetCount: zoneData.recordSetCount,
                    comment: zoneData.comment,
                    isPrivate: zoneData.isPrivate,
                    awsVpcId,
                    vpcId: vpc?.id ?? null,
                    tags: zoneData.tags,
                    lastSyncedAt: now,
                });
            }

            await this.hostedZoneRepository.save(dbZone);
        }

        return mapped;
    }
}

function mapAwsHostedZone(hz: HostedZone, tags: Record<string, string>, awsVpcId: string | null) {
    return {
        awsHostedZoneId: hz.Id?.replace('/hostedzone/', '') ?? '',
        name: hz.Name ?? '',
        zoneType: hz.Config?.PrivateZone ? 'PRIVATE' : 'PUBLIC',
        recordSetCount: hz.ResourceRecordSetCount ?? null,
        comment: hz.Config?.Comment ?? null,
        isPrivate: hz.Config?.PrivateZone ?? false,
        awsVpcId,
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

function mapDbHostedZone(zone: AwsRoute53HostedZone) {
    return {
        id: zone.id,
        cloudAccountId: zone.cloudAccountId,
        awsHostedZoneId: zone.awsHostedZoneId,
        name: zone.name,
        zoneType: zone.zoneType,
        recordSetCount: zone.recordSetCount,
        comment: zone.comment,
        isPrivate: zone.isPrivate,
        awsVpcId: zone.awsVpcId,
        vpcId: zone.vpcId,
        tags: zone.tags ?? {},
        lastSyncedAt: zone.lastSyncedAt,
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
        vpc: zone.vpc
            ? { id: zone.vpc.id, awsVpcId: zone.vpc.awsVpcId, cidrBlock: zone.vpc.cidrBlock, state: zone.vpc.state }
            : null,
    };
}
