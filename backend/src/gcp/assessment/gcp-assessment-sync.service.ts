import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

import { GcpConnectorService } from '../gcp-connector.service';
import { GcpComputeService } from '../compute/gcp-compute.service';
import { GcpNetworkingService } from '../networking/gcp-networking.service';
import { GcpStorageService } from '../storage/gcp-storage.service';
import { GcpSqlService } from '../sql/gcp-sql.service';
import { GcpIamService } from '../iam/gcp-iam.service';
import { GcpGkeService } from '../gke/gcp-gke.service';
import { GcpCdnService } from '../cdn/gcp-cdn.service';
import { GcpCloudRunService } from '../cloudrun/gcp-cloudrun.service';

@Injectable()
export class GcpAssessmentSyncService {
    private readonly logger = new Logger(GcpAssessmentSyncService.name);

    constructor(
        private readonly connector: GcpConnectorService,
        private readonly computeService: GcpComputeService,
        private readonly networkingService: GcpNetworkingService,
        private readonly storageService: GcpStorageService,
        private readonly sqlService: GcpSqlService,
        private readonly iamService: GcpIamService,
        private readonly gkeService: GcpGkeService,
        private readonly cdnService: GcpCdnService,
        private readonly cloudRunService: GcpCloudRunService
    ) {}

    async syncAll(cloudAccountId: string, organizationId: string): Promise<{ warnings: string[] }> {
        this.logger.log(`[${cloudAccountId}] Iniciando sincronização completa GCP`);

        await this.connector.resolveCredentials(cloudAccountId, organizationId);

        const steps: Array<{ name: string; run: () => Promise<unknown> }> = [
            { name: 'VPC Networks', run: () => this.networkingService.syncNetworksFromGcp(cloudAccountId, organizationId) },
            { name: 'Subnetworks', run: () => this.networkingService.syncSubnetworksFromGcp(cloudAccountId, organizationId) },
            { name: 'Firewall Rules', run: () => this.networkingService.syncFirewallRulesFromGcp(cloudAccountId, organizationId) },
            { name: 'VM Instances', run: () => this.computeService.syncInstancesFromGcp(cloudAccountId, organizationId) },
            { name: 'Storage Buckets', run: () => this.storageService.syncBucketsFromGcp(cloudAccountId, organizationId) },
            { name: 'Cloud SQL Instances', run: () => this.sqlService.syncInstancesFromGcp(cloudAccountId, organizationId) },
            { name: 'GKE Clusters', run: () => this.gkeService.syncClustersFromGcp(cloudAccountId, organizationId) },
            { name: 'Service Accounts', run: () => this.iamService.syncServiceAccountsFromGcp(cloudAccountId, organizationId) },
            { name: 'CDN Backend Services', run: () => this.cdnService.syncFromGcp(cloudAccountId, organizationId) },
            { name: 'Cloud Run Services', run: () => this.cloudRunService.syncFromGcp(cloudAccountId, organizationId) },
            { name: 'Cloud Run Jobs', run: () => this.cloudRunService.syncJobsFromGcp(cloudAccountId, organizationId) },
        ];

        let successCount = 0;
        const failures: string[] = [];
        const failureMessages: string[] = [];

        for (const step of steps) {
            const result = await this.runStep(step.name, step.run);
            if (result.succeeded) {
                successCount += 1;
            } else {
                failures.push(step.name);
                if (result.error) {
                    failureMessages.push(result.error);
                }
            }
        }

        if (successCount === 0) {
            throw new InternalServerErrorException(this.buildUserFacingSyncError(failureMessages, failures));
        }

        if (failures.length > 0) {
            this.logger.warn(`[${cloudAccountId}] Sincronização GCP concluída com falhas parciais: ${failures.join(', ')}`);
        } else {
            this.logger.log(`[${cloudAccountId}] Sincronização GCP concluída`);
        }

        return { warnings: failureMessages };
    }

    private buildUserFacingSyncError(failureMessages: string[], failures: string[]): string {
        const combined = failureMessages.join(' | ').toLowerCase();

        if (combined.includes('invalid_grant') || combined.includes('invalid jwt signature')) {
            return 'Falha de autenticação GCP: credenciais da plataforma inválidas (GCP_SA_CREDENTIALS_JSON) ou impersonation mal configurada. Verifique a chave da service account da plataforma e conceda roles/iam.serviceAccountTokenCreator na service account do cliente.';
        }

        if (failureMessages.length === 1) {
            return failureMessages[0];
        }

        const primary = failureMessages[0] ?? `Falha ao sincronizar recursos GCP (${failures.join(', ')})`;
        return `${primary} (+${failureMessages.length - 1} outras falhas no sync)`;
    }

    private async runStep(name: string, fn: () => Promise<unknown>): Promise<{ succeeded: boolean; error?: string }> {
        try {
            await fn();
            this.logger.debug(`[gcp-sync] ${name}: OK`);
            return { succeeded: true };
        } catch (err) {
            const cause = this.extractGcpErrorMessage(err);
            this.logger.warn(`[gcp-sync] ${name}: FALHOU — ${cause}`);
            return { succeeded: false, error: `${name}: ${cause}` };
        }
    }

    private extractGcpErrorMessage(err: unknown): string {
        if (err instanceof Error) {
            // googleapis errors carry response details in err.response?.data or err.errors
            const anyErr = err as any;
            const gcpMsg = anyErr?.response?.data?.error?.message ?? anyErr?.errors?.[0]?.message ?? anyErr?.response?.data?.message ?? null;
            if (gcpMsg) return `${err.message} | GCP: ${gcpMsg}`;
            return err.message;
        }
        return String(err);
    }
}
