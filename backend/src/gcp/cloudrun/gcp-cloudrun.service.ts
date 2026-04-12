import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpCloudRunService as GcpCloudRunServiceEntity } from '../../db/entites/gcp-cloud-run-service.entity';
import { GcpCloudRunJob } from '../../db/entites/gcp-cloud-run-job.entity';

@Injectable()
export class GcpCloudRunService {
    private readonly logger = new Logger(GcpCloudRunService.name);

    constructor(
        private readonly connector: GcpConnectorService,

        @InjectRepository(GcpCloudRunServiceEntity)
        private readonly serviceRepo: Repository<GcpCloudRunServiceEntity>,

        @InjectRepository(GcpCloudRunJob)
        private readonly jobRepo: Repository<GcpCloudRunJob>
    ) {}

    async listFromDatabase(cloudAccountId: string): Promise<GcpCloudRunServiceEntity[]> {
        return this.serviceRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpCloudRunServiceEntity[]> {
        const { client, projectId } = await this.connector.getRunClient(cloudAccountId, organizationId);

        // Cloud Run v2 does NOT support the '-' wildcard for location.
        // First list the locations where Cloud Run is enabled, then query each one.
        const locationsResponse = await (client.projects.locations as any)
            .list({ name: `projects/${projectId}` })
            .catch((err: unknown) => {
                throw new BadRequestException(
                    `Falha ao listar regiões Cloud Run (run.projects.locations.list): ${(err as Error)?.message ?? err}`
                );
            });

        const locations: string[] = ((locationsResponse.data.locations ?? []) as any[])
            .map((l) => l.locationId as string)
            .filter(Boolean);

        if (locations.length === 0) {
            this.logger.warn(`[${cloudAccountId}] Nenhuma região Cloud Run encontrada para o projeto ${projectId}`);
            return [];
        }

        const now = new Date();
        const upserted: GcpCloudRunServiceEntity[] = [];

        for (const location of locations) {
            let pageToken: string | undefined;

            do {
                const response = await (client.projects.locations.services as any)
                    .list({
                        parent: `projects/${projectId}/locations/${location}`,
                        pageSize: 100,
                        ...(pageToken ? { pageToken } : {}),
                    })
                    .catch((err: unknown) => {
                        this.logger.warn(
                            `[${cloudAccountId}] Falha ao listar Cloud Run services em ${location}: ${(err as Error)?.message ?? err}`
                        );
                        return null;
                    });

                if (!response) break;

                pageToken = (response.data.nextPageToken as string | undefined) ?? undefined;

                for (const svc of (response.data.services ?? []) as any[]) {
                    const gcpServiceName: string = svc.name ?? '';
                    if (!gcpServiceName) continue;

                    const shortName = gcpServiceName.split('/').pop() ?? gcpServiceName;

                    // terminalCondition.type is always "Ready"; the real status is in .state
                    const condition: string | null = svc.terminalCondition?.state ?? null;
                    const uri: string | null = svc.uri ?? null;

                    // allowsUnauthenticated: check IAM policy for allUsers binding
                    let allowsUnauthenticated = false;
                    try {
                        const iamRes = await (client.projects.locations.services as any)
                            .getIamPolicy({ resource: gcpServiceName })
                            .catch(() => null);
                        const bindings: any[] = iamRes?.data?.bindings ?? [];
                        allowsUnauthenticated = bindings.some(
                            (b: any) => b.role === 'roles/run.invoker' && (b.members as string[] | undefined)?.includes('allUsers')
                        );
                    } catch {
                        // default false — no additional error needed, sync continues
                    }

                    // Latest revision info
                    const latestContainer = svc.template?.containers?.[0] ?? null;
                    const containerImage: string | null = latestContainer?.image ?? null;
                    const cpuLimit: string | null = latestContainer?.resources?.limits?.cpu ?? null;
                    const memoryLimit: string | null = latestContainer?.resources?.limits?.memory ?? null;

                    const maxInstanceCount: number | null = svc.template?.scaling?.maxInstanceCount ?? null;
                    const minInstanceCount: number | null = svc.template?.scaling?.minInstanceCount ?? null;

                    const vpcConnector: string | null =
                        svc.template?.vpcAccess?.connector ??
                        svc.template?.vpcAccess?.networkInterfaces?.[0]?.network ??
                        null;

                    // latestReadyRevision is a full resource path — keep it for architecture but also extract short name
                    const latestReadyRevision: string | null = svc.latestReadyRevision
                        ? ((svc.latestReadyRevision as string).split('/').pop() ?? svc.latestReadyRevision)
                        : null;

                    let existing = await this.serviceRepo.findOne({ where: { cloudAccountId, gcpServiceName } });

                    if (existing) {
                        existing.name = shortName;
                        existing.region = location;
                        existing.condition = condition;
                        existing.uri = uri;
                        existing.allowsUnauthenticated = allowsUnauthenticated;
                        existing.latestReadyRevision = latestReadyRevision;
                        existing.containerImage = containerImage;
                        existing.maxInstanceCount = maxInstanceCount;
                        existing.minInstanceCount = minInstanceCount;
                        existing.cpuLimit = cpuLimit;
                        existing.memoryLimit = memoryLimit;
                        existing.vpcConnector = vpcConnector;
                        existing.labels = svc.labels ?? null;
                        existing.createTime = svc.createTime ? new Date(svc.createTime as string) : null;
                        existing.lastSyncedAt = now;
                    } else {
                        existing = this.serviceRepo.create({
                            cloudAccountId,
                            gcpServiceName,
                            name: shortName,
                            region: location,
                            condition,
                            uri,
                            allowsUnauthenticated,
                            latestReadyRevision,
                            containerImage,
                            maxInstanceCount,
                            minInstanceCount,
                            cpuLimit,
                            memoryLimit,
                            vpcConnector,
                            labels: svc.labels ?? null,
                            createTime: svc.createTime ? new Date(svc.createTime as string) : null,
                            lastSyncedAt: now,
                        });
                    }

                    upserted.push(await this.serviceRepo.save(existing));
                }
            } while (pageToken);
        }

        return upserted;
    }

    // ── Jobs ──────────────────────────────────────────────────────────────────

    async listJobsFromDatabase(cloudAccountId: string): Promise<GcpCloudRunJob[]> {
        return this.jobRepo.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async syncJobsFromGcp(cloudAccountId: string, organizationId: string): Promise<GcpCloudRunJob[]> {
        const { client, projectId } = await this.connector.getRunClient(cloudAccountId, organizationId);

        // Reuse the same location listing pattern — Jobs v2 also doesn't support '-' wildcard.
        const locationsResponse = await (client.projects.locations as any)
            .list({ name: `projects/${projectId}` })
            .catch((err: unknown) => {
                throw new BadRequestException(
                    `Falha ao listar regiões Cloud Run Jobs (run.projects.locations.list): ${(err as Error)?.message ?? err}`
                );
            });

        const locations: string[] = ((locationsResponse.data.locations ?? []) as any[])
            .map((l) => l.locationId as string)
            .filter(Boolean);

        if (locations.length === 0) {
            this.logger.warn(`[${cloudAccountId}] Nenhuma região Cloud Run encontrada para jobs no projeto ${projectId}`);
            return [];
        }

        const now = new Date();
        const upserted: GcpCloudRunJob[] = [];

        for (const location of locations) {
            let pageToken: string | undefined;

            do {
                const response = await (client.projects.locations as any)
                    .jobs.list({
                        parent: `projects/${projectId}/locations/${location}`,
                        pageSize: 100,
                        ...(pageToken ? { pageToken } : {}),
                    })
                    .catch((err: unknown) => {
                        this.logger.warn(
                            `[${cloudAccountId}] Falha ao listar Cloud Run jobs em ${location}: ${(err as Error)?.message ?? err}`
                        );
                        return null;
                    });

                if (!response) break;

                pageToken = (response.data.nextPageToken as string | undefined) ?? undefined;

                for (const job of (response.data.jobs ?? []) as any[]) {
                    const gcpJobName: string = job.name ?? '';
                    if (!gcpJobName) continue;

                    const shortName = gcpJobName.split('/').pop() ?? gcpJobName;
                    const condition: string | null = job.terminalCondition?.state ?? null;

                    const templateContainer = job.template?.template?.containers?.[0] ?? null;
                    const containerImage: string | null = templateContainer?.image ?? null;
                    const cpuLimit: string | null = templateContainer?.resources?.limits?.cpu ?? null;
                    const memoryLimit: string | null = templateContainer?.resources?.limits?.memory ?? null;

                    const taskCount: number | null = job.template?.taskCount ?? null;
                    const maxRetries: number | null = job.template?.maxRetries ?? null;
                    const executionCount: number | null =
                        typeof job.executionCount === 'number' ? job.executionCount : null;

                    const latestCreatedExecution: string | null = job.latestCreatedExecution?.name
                        ? ((job.latestCreatedExecution.name as string).split('/').pop() ?? null)
                        : null;

                    let existing = await this.jobRepo.findOne({ where: { cloudAccountId, gcpJobName } });

                    if (existing) {
                        existing.name = shortName;
                        existing.region = location;
                        existing.condition = condition;
                        existing.containerImage = containerImage;
                        existing.cpuLimit = cpuLimit;
                        existing.memoryLimit = memoryLimit;
                        existing.taskCount = taskCount;
                        existing.maxRetries = maxRetries;
                        existing.executionCount = executionCount;
                        existing.latestCreatedExecution = latestCreatedExecution;
                        existing.labels = job.labels ?? null;
                        existing.createTime = job.createTime ? new Date(job.createTime as string) : null;
                        existing.lastSyncedAt = now;
                    } else {
                        existing = this.jobRepo.create({
                            cloudAccountId,
                            gcpJobName,
                            name: shortName,
                            region: location,
                            condition,
                            containerImage,
                            cpuLimit,
                            memoryLimit,
                            taskCount,
                            maxRetries,
                            executionCount,
                            latestCreatedExecution,
                            labels: job.labels ?? null,
                            createTime: job.createTime ? new Date(job.createTime as string) : null,
                            lastSyncedAt: now,
                        });
                    }

                    upserted.push(await this.jobRepo.save(existing));
                }
            } while (pageToken);
        }

        return upserted;
    }
}
