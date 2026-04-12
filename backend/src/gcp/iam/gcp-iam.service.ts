import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpServiceAccount } from '../../db/entites/gcp-service-account.entity';

@Injectable()
export class GcpIamService {
    private readonly logger = new Logger(GcpIamService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpServiceAccount)
        private readonly saRepo: Repository<GcpServiceAccount>
    ) {}

    async listServiceAccountsFromDatabase(cloudAccountId: string): Promise<GcpServiceAccount[]> {
        return this.saRepo.find({ where: { cloudAccountId }, order: { email: 'ASC' } });
    }

    async syncServiceAccountsFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpServiceAccount[]> {
        const { client, projectId } = await this.connector.getIamClient(cloudAccountId, organizationId);

        const allAccounts: any[] = [];
        let pageToken: string | undefined;

        do {
            const response = await (client.projects.serviceAccounts as any)
                .list({ name: `projects/${projectId}`, pageSize: 100, pageToken })
                .catch((err: unknown) => {
                    throw new BadRequestException(`Falha ao listar service accounts GCP (iam.serviceaccounts.list): ${(err as Error)?.message ?? err}`);
                });

            allAccounts.push(...(response.data.accounts ?? []));
            pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken);

        const now = new Date();
        const upserted: GcpServiceAccount[] = [];

        for (const sa of allAccounts) {
            const email = sa.email ?? '';
            if (!email) continue;

            let existing = await this.saRepo.findOne({ where: { cloudAccountId, email } });

            if (existing) {
                existing.gcpUniqueId = sa.uniqueId ?? null;
                existing.displayName = sa.displayName ?? null;
                existing.description = sa.description ?? null;
                existing.disabled = sa.disabled ?? false;
                existing.lastSyncedAt = now;
            } else {
                existing = this.saRepo.create({
                    cloudAccountId,
                    email,
                    gcpUniqueId: sa.uniqueId ?? null,
                    displayName: sa.displayName ?? null,
                    description: sa.description ?? null,
                    disabled: sa.disabled ?? false,
                    lastSyncedAt: now,
                });
            }

            upserted.push(await this.saRepo.save(existing));
        }

        return upserted;
    }
}
