import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpSqlInstance } from '../../db/entites/gcp-sql-instance.entity';

@Injectable()
export class GcpSqlService {
    private readonly logger = new Logger(GcpSqlService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpSqlInstance)
        private readonly sqlRepo: Repository<GcpSqlInstance>
    ) {}

    async listInstancesFromDatabase(cloudAccountId: string): Promise<GcpSqlInstance[]> {
        return this.sqlRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncInstancesFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpSqlInstance[]> {
        const { client, projectId } = await this.connector.getSqlAdminClient(cloudAccountId, organizationId);

        const response = await (client.instances as any).list({ project: projectId }).catch((err: unknown) => {
            throw new BadRequestException(`Falha ao listar instâncias Cloud SQL (sqladmin.instances.list): ${(err as Error)?.message ?? err}`);
        });

        const now = new Date();
        const upserted: GcpSqlInstance[] = [];

        for (const instance of response.data.items ?? []) {
            const gcpInstanceId = instance.name ?? '';
            if (!gcpInstanceId) continue;

            const settings = instance.settings ?? {};
            const ipAddresses = instance.ipAddresses ?? null;

            let existing = await this.sqlRepo.findOne({ where: { cloudAccountId, gcpInstanceId } });

            if (existing) {
                existing.name = instance.name ?? existing.name;
                existing.databaseVersion = instance.databaseVersion ?? existing.databaseVersion;
                existing.region = instance.region ?? existing.region;
                existing.state = instance.state ?? existing.state;
                existing.tier = settings.tier ?? null;
                existing.ipAddresses = ipAddresses;
                existing.diskType = settings.dataDiskType ?? null;
                existing.diskSizeGb = settings.dataDiskSizeGb ? parseInt(settings.dataDiskSizeGb, 10) : null;
                existing.backupEnabled = settings.backupConfiguration?.enabled ?? false;
                existing.availabilityType = settings.availabilityType ?? null;
                existing.userLabels = settings.userLabels ?? null;
                existing.createTime = instance.createTime ? new Date(instance.createTime) : null;
                existing.lastSyncedAt = now;
            } else {
                existing = this.sqlRepo.create({
                    cloudAccountId,
                    gcpInstanceId,
                    name: instance.name ?? '',
                    databaseVersion: instance.databaseVersion ?? '',
                    region: instance.region ?? '',
                    state: instance.state ?? 'UNKNOWN',
                    tier: settings.tier ?? null,
                    ipAddresses,
                    diskType: settings.dataDiskType ?? null,
                    diskSizeGb: settings.dataDiskSizeGb ? parseInt(settings.dataDiskSizeGb, 10) : null,
                    backupEnabled: settings.backupConfiguration?.enabled ?? false,
                    availabilityType: settings.availabilityType ?? null,
                    userLabels: settings.userLabels ?? null,
                    createTime: instance.createTime ? new Date(instance.createTime) : null,
                    lastSyncedAt: now,
                });
            }

            upserted.push(await this.sqlRepo.save(existing));
        }

        return upserted;
    }
}
