import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GcpVmInstance } from '../../db/entites/gcp-vm-instance.entity';
import { GcpVpcNetwork } from '../../db/entites/gcp-vpc-network.entity';
import { GcpSubnetwork } from '../../db/entites/gcp-subnetwork.entity';
import { GcpFirewallRule } from '../../db/entites/gcp-firewall-rule.entity';
import { GcpStorageBucket } from '../../db/entites/gcp-storage-bucket.entity';
import { GcpSqlInstance } from '../../db/entites/gcp-sql-instance.entity';
import { GcpServiceAccount } from '../../db/entites/gcp-service-account.entity';
import { GcpGkeCluster } from '../../db/entites/gcp-gke-cluster.entity';
import { GcpCdnBackendService } from '../../db/entites/gcp-cdn-backend-service.entity';
import { GcpCloudRunService } from '../../db/entites/gcp-cloud-run-service.entity';
import { GcpCloudRunJob } from '../../db/entites/gcp-cloud-run-job.entity';

export interface GcpAssessmentData {
    vmInstances: GcpVmInstance[];
    vpcNetworks: GcpVpcNetwork[];
    subnetworks: GcpSubnetwork[];
    firewallRules: GcpFirewallRule[];
    storageBuckets: GcpStorageBucket[];
    sqlInstances: GcpSqlInstance[];
    serviceAccounts: GcpServiceAccount[];
    gkeClusters: GcpGkeCluster[];
    cdnBackendServices: GcpCdnBackendService[];
    cloudRunServices: GcpCloudRunService[];
    cloudRunJobs: GcpCloudRunJob[];
}

export interface GcpAssessmentSummary {
    totalResources: number;
    byType: Record<string, number>;
}

@Injectable()
export class GcpAssessmentReportService {
    constructor(
        @InjectRepository(GcpVmInstance) private readonly vmRepo: Repository<GcpVmInstance>,
        @InjectRepository(GcpVpcNetwork) private readonly networkRepo: Repository<GcpVpcNetwork>,
        @InjectRepository(GcpSubnetwork) private readonly subnetRepo: Repository<GcpSubnetwork>,
        @InjectRepository(GcpFirewallRule) private readonly firewallRepo: Repository<GcpFirewallRule>,
        @InjectRepository(GcpStorageBucket) private readonly bucketRepo: Repository<GcpStorageBucket>,
        @InjectRepository(GcpSqlInstance) private readonly sqlRepo: Repository<GcpSqlInstance>,
        @InjectRepository(GcpServiceAccount) private readonly saRepo: Repository<GcpServiceAccount>,
        @InjectRepository(GcpGkeCluster) private readonly gkeRepo: Repository<GcpGkeCluster>,
        @InjectRepository(GcpCdnBackendService) private readonly cdnRepo: Repository<GcpCdnBackendService>,
        @InjectRepository(GcpCloudRunService) private readonly cloudRunRepo: Repository<GcpCloudRunService>,
        @InjectRepository(GcpCloudRunJob) private readonly cloudRunJobRepo: Repository<GcpCloudRunJob>
    ) {}

    async collectAllData(cloudAccountId: string): Promise<GcpAssessmentData> {
        const byAccount = { cloudAccountId };

        const [
            vmInstances,
            vpcNetworks,
            subnetworks,
            firewallRules,
            storageBuckets,
            sqlInstances,
            serviceAccounts,
            gkeClusters,
            cdnBackendServices,
            cloudRunServices,
            cloudRunJobs,
        ] = await Promise.all([
            this.vmRepo.find({ where: byAccount }),
            this.networkRepo.find({ where: byAccount }),
            this.subnetRepo.find({ where: byAccount }),
            this.firewallRepo.find({ where: byAccount }),
            this.bucketRepo.find({ where: byAccount }),
            this.sqlRepo.find({ where: byAccount }),
            this.saRepo.find({ where: byAccount }),
            this.gkeRepo.find({ where: byAccount }),
            this.cdnRepo.find({ where: byAccount }),
            this.cloudRunRepo.find({ where: byAccount }),
            this.cloudRunJobRepo.find({ where: byAccount }),
        ]);

        return {
            vmInstances,
            vpcNetworks,
            subnetworks,
            firewallRules,
            storageBuckets,
            sqlInstances,
            serviceAccounts,
            gkeClusters,
            cdnBackendServices,
            cloudRunServices,
            cloudRunJobs,
        };
    }

    buildSummary(data: GcpAssessmentData): GcpAssessmentSummary {
        const byType: Record<string, number> = {
            'VM Instance': data.vmInstances.length,
            'VPC Network': data.vpcNetworks.length,
            Subnetwork: data.subnetworks.length,
            'Firewall Rule': data.firewallRules.length,
            'Storage Bucket': data.storageBuckets.length,
            'Cloud SQL Instance': data.sqlInstances.length,
            'Service Account': data.serviceAccounts.length,
            'GKE Cluster': data.gkeClusters.length,
            'CDN Backend Service': data.cdnBackendServices.length,
            'Cloud Run Service': data.cloudRunServices.length,
            'Cloud Run Job': data.cloudRunJobs.length,
        };
        const totalResources = Object.values(byType).reduce((a, b) => a + b, 0);
        return { totalResources, byType };
    }
}
