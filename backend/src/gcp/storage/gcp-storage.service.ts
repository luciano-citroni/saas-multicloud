import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpStorageBucket } from '../../db/entites/gcp-storage-bucket.entity';

@Injectable()
export class GcpStorageService {
    private readonly logger = new Logger(GcpStorageService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpStorageBucket)
        private readonly bucketRepo: Repository<GcpStorageBucket>
    ) {}

    async listBucketsFromDatabase(cloudAccountId: string): Promise<GcpStorageBucket[]> {
        return this.bucketRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncBucketsFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpStorageBucket[]> {
        const { client, projectId } = await this.connector.getStorageClient(cloudAccountId, organizationId);

        const response = await client.buckets
            .list({ project: projectId, maxResults: 500, fields: 'items(id,name,location,locationType,storageClass,versioning,iamConfiguration,labels,timeCreated),nextPageToken' })
            .catch((err: unknown) => {
                throw new BadRequestException(`Falha ao listar buckets GCP (storage.buckets.list): ${(err as Error)?.message ?? err}`);
            });

        const now = new Date();
        const upserted: GcpStorageBucket[] = [];

        for (const bucket of response.data.items ?? []) {
            const gcpBucketId = bucket.id ?? bucket.name ?? '';
            if (!gcpBucketId) continue;

            const versioningEnabled = (bucket.versioning as any)?.enabled ?? false;
            const iamConfig = bucket.iamConfiguration as any;
            const publicAccessPrevention = iamConfig?.publicAccessPrevention ?? null;
            const uniformBucketLevelAccess = iamConfig?.uniformBucketLevelAccess?.enabled ?? false;

            let existing = await this.bucketRepo.findOne({ where: { cloudAccountId, gcpBucketId } });

            if (existing) {
                existing.name = bucket.name ?? existing.name;
                existing.location = bucket.location ?? existing.location;
                existing.locationType = bucket.locationType ?? null;
                existing.storageClass = bucket.storageClass ?? existing.storageClass;
                existing.versioningEnabled = versioningEnabled;
                existing.publicAccessPrevention = publicAccessPrevention;
                existing.uniformBucketLevelAccess = uniformBucketLevelAccess;
                existing.labels = (bucket.labels as any) ?? null;
                existing.timeCreated = bucket.timeCreated ? new Date(bucket.timeCreated as string) : null;
                existing.lastSyncedAt = now;
            } else {
                existing = this.bucketRepo.create({
                    cloudAccountId,
                    gcpBucketId,
                    name: bucket.name ?? '',
                    location: bucket.location ?? '',
                    locationType: bucket.locationType ?? null,
                    storageClass: bucket.storageClass ?? 'STANDARD',
                    versioningEnabled,
                    publicAccessPrevention,
                    uniformBucketLevelAccess,
                    labels: (bucket.labels as any) ?? null,
                    timeCreated: bucket.timeCreated ? new Date(bucket.timeCreated as string) : null,
                    lastSyncedAt: now,
                });
            }

            upserted.push(await this.bucketRepo.save(existing));
        }

        return upserted;
    }
}
