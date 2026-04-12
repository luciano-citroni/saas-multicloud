import { Injectable, Logger } from '@nestjs/common';

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
        private readonly computeService: GcpComputeService,
        private readonly networkingService: GcpNetworkingService,
        private readonly storageService: GcpStorageService,
        private readonly sqlService: GcpSqlService,
        private readonly iamService: GcpIamService,
        private readonly gkeService: GcpGkeService,
        private readonly cdnService: GcpCdnService,
        private readonly cloudRunService: GcpCloudRunService
    ) {}

    async syncAll(cloudAccountId: string, organizationId: string): Promise<void> {
        this.logger.log(`[${cloudAccountId}] Iniciando sincronização completa GCP`);

        await this.runStep('VPC Networks', () => this.networkingService.syncNetworksFromGcp(cloudAccountId, organizationId));
        await this.runStep('Subnetworks', () => this.networkingService.syncSubnetworksFromGcp(cloudAccountId, organizationId));
        await this.runStep('Firewall Rules', () => this.networkingService.syncFirewallRulesFromGcp(cloudAccountId, organizationId));
        await this.runStep('VM Instances', () => this.computeService.syncInstancesFromGcp(cloudAccountId, organizationId));
        await this.runStep('Storage Buckets', () => this.storageService.syncBucketsFromGcp(cloudAccountId, organizationId));
        await this.runStep('Cloud SQL Instances', () => this.sqlService.syncInstancesFromGcp(cloudAccountId, organizationId));
        await this.runStep('GKE Clusters', () => this.gkeService.syncClustersFromGcp(cloudAccountId, organizationId));
        await this.runStep('Service Accounts', () => this.iamService.syncServiceAccountsFromGcp(cloudAccountId, organizationId));
        await this.runStep('CDN Backend Services', () => this.cdnService.syncFromGcp(cloudAccountId, organizationId));
        await this.runStep('Cloud Run Services', () => this.cloudRunService.syncFromGcp(cloudAccountId, organizationId));
        await this.runStep('Cloud Run Jobs', () => this.cloudRunService.syncJobsFromGcp(cloudAccountId, organizationId));

        this.logger.log(`[${cloudAccountId}] Sincronização GCP concluída`);
    }

    private async runStep(name: string, fn: () => Promise<any>): Promise<void> {
        try {
            await fn();
            this.logger.debug(`[gcp-sync] ${name}: OK`);
        } catch (err) {
            const cause = this.extractGcpErrorMessage(err);
            this.logger.warn(`[gcp-sync] ${name}: FALHOU — ${cause}`);
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
