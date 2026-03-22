import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AzureSubscription } from '../../db/entites/azure-subscription.entity';
import { AzureResourceGroup } from '../../db/entites/azure-resource-group.entity';
import { AzureVirtualMachine } from '../../db/entites/azure-virtual-machine.entity';
import { AzureVmss } from '../../db/entites/azure-vmss.entity';
import { AzureAksCluster } from '../../db/entites/azure-aks-cluster.entity';
import { AzureDisk } from '../../db/entites/azure-disk.entity';
import { AzureWebApp } from '../../db/entites/azure-web-app.entity';
import { AzureAppServicePlan } from '../../db/entites/azure-app-service-plan.entity';
import { AzureVirtualNetwork } from '../../db/entites/azure-virtual-network.entity';
import { AzureNetworkInterface } from '../../db/entites/azure-network-interface.entity';
import { AzurePublicIp } from '../../db/entites/azure-public-ip.entity';
import { AzureNsg } from '../../db/entites/azure-nsg.entity';
import { AzureLoadBalancer } from '../../db/entites/azure-load-balancer.entity';
import { AzureApplicationGateway } from '../../db/entites/azure-application-gateway.entity';
import { AzureStorageAccount } from '../../db/entites/azure-storage-account.entity';
import { AzureSqlServer } from '../../db/entites/azure-sql-server.entity';
import { AzureSqlDatabase } from '../../db/entites/azure-sql-database.entity';
import { AzurePostgresServer } from '../../db/entites/azure-postgres-server.entity';
import { AzureCosmosDb } from '../../db/entites/azure-cosmos-db.entity';
import { AzureKeyVault } from '../../db/entites/azure-key-vault.entity';
import { AzureRecoveryVault } from '../../db/entites/azure-recovery-vault.entity';

export interface AzureAssessmentData {
    subscriptions: AzureSubscription[];
    resourceGroups: AzureResourceGroup[];
    virtualMachines: AzureVirtualMachine[];
    vmss: AzureVmss[];
    aksClusters: AzureAksCluster[];
    disks: AzureDisk[];
    webApps: AzureWebApp[];
    appServicePlans: AzureAppServicePlan[];
    virtualNetworks: AzureVirtualNetwork[];
    networkInterfaces: AzureNetworkInterface[];
    publicIps: AzurePublicIp[];
    nsgs: AzureNsg[];
    loadBalancers: AzureLoadBalancer[];
    applicationGateways: AzureApplicationGateway[];
    storageAccounts: AzureStorageAccount[];
    sqlServers: AzureSqlServer[];
    sqlDatabases: AzureSqlDatabase[];
    postgresServers: AzurePostgresServer[];
    cosmosDbAccounts: AzureCosmosDb[];
    keyVaults: AzureKeyVault[];
    recoveryVaults: AzureRecoveryVault[];
}

export interface AzureAssessmentSummary {
    totalResources: number;
    byType: Record<string, number>;
}

@Injectable()
export class AzureAssessmentReportService {
    constructor(
        @InjectRepository(AzureSubscription)
        private readonly subscriptionRepo: Repository<AzureSubscription>,

        @InjectRepository(AzureResourceGroup)
        private readonly resourceGroupRepo: Repository<AzureResourceGroup>,

        @InjectRepository(AzureVirtualMachine)
        private readonly vmRepo: Repository<AzureVirtualMachine>,

        @InjectRepository(AzureVmss)
        private readonly vmssRepo: Repository<AzureVmss>,

        @InjectRepository(AzureAksCluster)
        private readonly aksRepo: Repository<AzureAksCluster>,

        @InjectRepository(AzureDisk)
        private readonly diskRepo: Repository<AzureDisk>,

        @InjectRepository(AzureWebApp)
        private readonly webAppRepo: Repository<AzureWebApp>,

        @InjectRepository(AzureAppServicePlan)
        private readonly appServicePlanRepo: Repository<AzureAppServicePlan>,

        @InjectRepository(AzureVirtualNetwork)
        private readonly vnetRepo: Repository<AzureVirtualNetwork>,

        @InjectRepository(AzureNetworkInterface)
        private readonly nicRepo: Repository<AzureNetworkInterface>,

        @InjectRepository(AzurePublicIp)
        private readonly publicIpRepo: Repository<AzurePublicIp>,

        @InjectRepository(AzureNsg)
        private readonly nsgRepo: Repository<AzureNsg>,

        @InjectRepository(AzureLoadBalancer)
        private readonly lbRepo: Repository<AzureLoadBalancer>,

        @InjectRepository(AzureApplicationGateway)
        private readonly appGwRepo: Repository<AzureApplicationGateway>,

        @InjectRepository(AzureStorageAccount)
        private readonly storageRepo: Repository<AzureStorageAccount>,

        @InjectRepository(AzureSqlServer)
        private readonly sqlServerRepo: Repository<AzureSqlServer>,

        @InjectRepository(AzureSqlDatabase)
        private readonly sqlDbRepo: Repository<AzureSqlDatabase>,

        @InjectRepository(AzurePostgresServer)
        private readonly postgresRepo: Repository<AzurePostgresServer>,

        @InjectRepository(AzureCosmosDb)
        private readonly cosmosRepo: Repository<AzureCosmosDb>,

        @InjectRepository(AzureKeyVault)
        private readonly keyVaultRepo: Repository<AzureKeyVault>,

        @InjectRepository(AzureRecoveryVault)
        private readonly recoveryVaultRepo: Repository<AzureRecoveryVault>,
    ) {}

    async collectAllData(cloudAccountId: string): Promise<AzureAssessmentData> {
        const where = { cloudAccountId };

        const [
            [subscriptions],
            [resourceGroups],
            [virtualMachines],
            [vmss],
            [aksClusters],
            [disks],
            [webApps],
            [appServicePlans],
            [virtualNetworks],
            [networkInterfaces],
            [publicIps],
            [nsgs],
            [loadBalancers],
            [applicationGateways],
            [storageAccounts],
            [sqlServers],
            [sqlDatabases],
            [postgresServers],
            [cosmosDbAccounts],
            [keyVaults],
            [recoveryVaults],
        ] = await Promise.all([
            this.subscriptionRepo.findAndCount({ where }),
            this.resourceGroupRepo.findAndCount({ where }),
            this.vmRepo.findAndCount({ where }),
            this.vmssRepo.findAndCount({ where }),
            this.aksRepo.findAndCount({ where }),
            this.diskRepo.findAndCount({ where }),
            this.webAppRepo.findAndCount({ where }),
            this.appServicePlanRepo.findAndCount({ where }),
            this.vnetRepo.findAndCount({ where }),
            this.nicRepo.findAndCount({ where }),
            this.publicIpRepo.findAndCount({ where }),
            this.nsgRepo.findAndCount({ where }),
            this.lbRepo.findAndCount({ where }),
            this.appGwRepo.findAndCount({ where }),
            this.storageRepo.findAndCount({ where }),
            this.sqlServerRepo.findAndCount({ where }),
            this.sqlDbRepo.findAndCount({ where }),
            this.postgresRepo.findAndCount({ where }),
            this.cosmosRepo.findAndCount({ where }),
            this.keyVaultRepo.findAndCount({ where }),
            this.recoveryVaultRepo.findAndCount({ where }),
        ]);

        return {
            subscriptions,
            resourceGroups,
            virtualMachines,
            vmss,
            aksClusters,
            disks,
            webApps,
            appServicePlans,
            virtualNetworks,
            networkInterfaces,
            publicIps,
            nsgs,
            loadBalancers,
            applicationGateways,
            storageAccounts,
            sqlServers,
            sqlDatabases,
            postgresServers,
            cosmosDbAccounts,
            keyVaults,
            recoveryVaults,
        };
    }

    buildSummary(data: AzureAssessmentData): AzureAssessmentSummary {
        const byType: Record<string, number> = {
            Subscriptions: data.subscriptions.length,
            'Resource Groups': data.resourceGroups.length,
            'Virtual Machines': data.virtualMachines.length,
            'VM Scale Sets': data.vmss.length,
            'AKS Clusters': data.aksClusters.length,
            Disks: data.disks.length,
            'Web Apps': data.webApps.length,
            'App Service Plans': data.appServicePlans.length,
            'Virtual Networks': data.virtualNetworks.length,
            'Network Interfaces': data.networkInterfaces.length,
            'Public IPs': data.publicIps.length,
            NSGs: data.nsgs.length,
            'Load Balancers': data.loadBalancers.length,
            'Application Gateways': data.applicationGateways.length,
            'Storage Accounts': data.storageAccounts.length,
            'SQL Servers': data.sqlServers.length,
            'SQL Databases': data.sqlDatabases.length,
            'PostgreSQL Servers': data.postgresServers.length,
            'Cosmos DB Accounts': data.cosmosDbAccounts.length,
            'Key Vaults': data.keyVaults.length,
            'Recovery Vaults': data.recoveryVaults.length,
        };

        const totalResources = Object.values(byType).reduce((a, b) => a + b, 0);

        return { totalResources, byType };
    }
}
