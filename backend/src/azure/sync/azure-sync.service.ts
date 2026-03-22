import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientSecretCredential } from '@azure/identity';
import { ResourceGraphClient } from '@azure/arm-resourcegraph';
import { CloudService } from '../../cloud/cloud.service';
import { CloudProvider } from '../../db/entites/cloud-account.entity';
import { AzureSubscriptionsService } from '../subscriptions/azure-subscriptions.service';
import { AzureComputeService } from '../compute/azure-compute.service';
import { AzureNetworkingService } from '../networking/azure-networking.service';
import { AzureStorageService } from '../storage/azure-storage.service';
import { AzureDatabasesService } from '../databases/azure-databases.service';
import { AzureWebService } from '../web/azure-web.service';
import { AzureSecurityService } from '../security/azure-security.service';

/** Shape of the object returned by the Azure Resource Graph API. */
interface ArgResource {
    id: string;
    name: string;
    type: string;
    location?: string | null;
    resourceGroup?: string | null;
    subscriptionId?: string | null;
    tags?: Record<string, string> | null;
    properties?: Record<string, any> | null;
}

const ARG_KQL_QUERY = `
Resources
| where type in (
    "microsoft.resources/subscriptions",
    "microsoft.resources/resourcegroups",
    "microsoft.compute/virtualmachines",
    "microsoft.compute/virtualmachinescalesets",
    "microsoft.containerservice/managedclusters",
    "microsoft.web/sites",
    "microsoft.web/serverfarms",
    "microsoft.network/virtualnetworks",
    "microsoft.network/networkinterfaces",
    "microsoft.network/publicipaddresses",
    "microsoft.network/networksecuritygroups",
    "microsoft.network/loadbalancers",
    "microsoft.network/applicationgateways",
    "microsoft.storage/storageaccounts",
    "microsoft.compute/disks",
    "microsoft.recoveryservices/vaults",
    "microsoft.sql/servers",
    "microsoft.sql/servers/databases",
    "microsoft.dbforpostgresql/flexibleservers",
    "microsoft.documentdb/databaseaccounts",
    "microsoft.keyvault/vaults"
)
| project id, name, type, location, resourceGroup, subscriptionId, tags, properties
`.trim();

@Injectable()
export class AzureSyncService {
    private readonly logger = new Logger(AzureSyncService.name);

    constructor(
        private readonly cloudService: CloudService,
        private readonly subscriptions: AzureSubscriptionsService,
        private readonly compute: AzureComputeService,
        private readonly networking: AzureNetworkingService,
        private readonly storage: AzureStorageService,
        private readonly databases: AzureDatabasesService,
        private readonly web: AzureWebService,
        private readonly security: AzureSecurityService,
    ) {}

    async syncResources(
        cloudAccountId: string,
        organizationId: string,
    ): Promise<{ message: string; totalSynced: number; syncedAt: Date }> {
        // 1. Validate the CloudAccount exists and belongs to the organization
        const account = await this.cloudService.findByIdAndOrganization(cloudAccountId, organizationId);

        if (!account) {
            throw new NotFoundException(`CloudAccount '${cloudAccountId}' não encontrada nesta organização.`);
        }

        // 2. Ensure the provider is AZURE
        if (account.provider !== CloudProvider.AZURE) {
            throw new BadRequestException(
                `A conta '${cloudAccountId}' não é uma conta Azure (provider: ${account.provider}).`,
            );
        }

        // 3. Retrieve decrypted credentials
        const credentials = await this.cloudService.getDecryptedCredentials(cloudAccountId, organizationId);

        const { tenantId, clientId, clientSecret, subscriptionId, subscriptionIds } = credentials as {
            tenantId: string;
            clientId: string;
            clientSecret: string;
            subscriptionId?: string;
            subscriptionIds?: string[];
        };

        // 4. Build subscriptions array
        const subscriptionList: string[] = subscriptionIds ?? (subscriptionId ? [subscriptionId] : []);

        if (subscriptionList.length === 0) {
            throw new BadRequestException('As credenciais Azure não contêm nenhuma subscriptionId válida.');
        }

        // 5. Authenticate with Azure
        const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
        const client = new ResourceGraphClient(credential);

        // 6. Paginate and collect all resources from ARG
        const allResources: ArgResource[] = [];
        let skipToken: string | undefined;

        do {
            const response = await client.resources({
                query: ARG_KQL_QUERY,
                subscriptions: subscriptionList,
                options: { resultFormat: 'objectArray', skipToken },
            });

            if (Array.isArray(response.data)) {
                allResources.push(...(response.data as ArgResource[]));
            }

            skipToken = response.skipToken;
        } while (skipToken);

        this.logger.log(
            `[Azure Sync] CloudAccount ${cloudAccountId}: ${allResources.length} recursos retornados pelo ARG.`,
        );

        // 7. Group resources by type (lowercase)
        const byType = new Map<string, ArgResource[]>();

        for (const resource of allResources) {
            const key = resource.type.toLowerCase();

            if (!byType.has(key)) {
                byType.set(key, []);
            }

            byType.get(key)!.push(resource);
        }

        // 8. Route each resource type to the appropriate domain service
        await this.subscriptions.upsertSubscriptions(
            cloudAccountId,
            byType.get('microsoft.resources/subscriptions') ?? [],
        );
        await this.subscriptions.upsertResourceGroups(
            cloudAccountId,
            byType.get('microsoft.resources/resourcegroups') ?? [],
        );
        await this.compute.upsertVirtualMachines(
            cloudAccountId,
            byType.get('microsoft.compute/virtualmachines') ?? [],
        );
        await this.compute.upsertVmss(
            cloudAccountId,
            byType.get('microsoft.compute/virtualmachinescalesets') ?? [],
        );
        await this.compute.upsertAksClusters(
            cloudAccountId,
            byType.get('microsoft.containerservice/managedclusters') ?? [],
        );
        await this.compute.upsertDisks(
            cloudAccountId,
            byType.get('microsoft.compute/disks') ?? [],
        );
        await this.web.upsertWebApps(
            cloudAccountId,
            byType.get('microsoft.web/sites') ?? [],
        );
        await this.web.upsertAppServicePlans(
            cloudAccountId,
            byType.get('microsoft.web/serverfarms') ?? [],
        );
        await this.networking.upsertVirtualNetworks(
            cloudAccountId,
            byType.get('microsoft.network/virtualnetworks') ?? [],
        );
        await this.networking.upsertNetworkInterfaces(
            cloudAccountId,
            byType.get('microsoft.network/networkinterfaces') ?? [],
        );
        await this.networking.upsertPublicIps(
            cloudAccountId,
            byType.get('microsoft.network/publicipaddresses') ?? [],
        );
        await this.networking.upsertNsgs(
            cloudAccountId,
            byType.get('microsoft.network/networksecuritygroups') ?? [],
        );
        await this.networking.upsertLoadBalancers(
            cloudAccountId,
            byType.get('microsoft.network/loadbalancers') ?? [],
        );
        await this.networking.upsertApplicationGateways(
            cloudAccountId,
            byType.get('microsoft.network/applicationgateways') ?? [],
        );
        await this.storage.upsertStorageAccounts(
            cloudAccountId,
            byType.get('microsoft.storage/storageaccounts') ?? [],
        );
        await this.databases.upsertSqlServers(
            cloudAccountId,
            byType.get('microsoft.sql/servers') ?? [],
        );
        await this.databases.upsertSqlDatabases(
            cloudAccountId,
            byType.get('microsoft.sql/servers/databases') ?? [],
        );
        await this.databases.upsertPostgresServers(
            cloudAccountId,
            byType.get('microsoft.dbforpostgresql/flexibleservers') ?? [],
        );
        await this.databases.upsertCosmosDbAccounts(
            cloudAccountId,
            byType.get('microsoft.documentdb/databaseaccounts') ?? [],
        );
        await this.security.upsertKeyVaults(
            cloudAccountId,
            byType.get('microsoft.keyvault/vaults') ?? [],
        );
        await this.security.upsertRecoveryVaults(
            cloudAccountId,
            byType.get('microsoft.recoveryservices/vaults') ?? [],
        );

        return {
            message: 'Sincronização concluída com sucesso.',
            totalSynced: allResources.length,
            syncedAt: new Date(),
        };
    }
}
