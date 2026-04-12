export type GcpVmInstance = {
    id: string;
    cloudAccountId: string;
    gcpInstanceId: string;
    name: string;
    zone: string;
    machineType: string;
    status: string;
    networkIp: string | null;
    externalIp: string | null;
    deletionProtection: boolean;
    canIpForward: boolean;
    serviceAccountEmail: string | null;
    labels: Record<string, string> | null;
    creationTimestamp: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpVpcNetwork = {
    id: string;
    cloudAccountId: string;
    gcpNetworkId: string;
    name: string;
    description: string | null;
    routingMode: string | null;
    autoCreateSubnetworks: boolean;
    subnetworkUrls: string[] | null;
    creationTimestamp: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpSubnetwork = {
    id: string;
    cloudAccountId: string;
    gcpSubnetworkId: string;
    name: string;
    region: string;
    ipCidrRange: string;
    networkName: string | null;
    privateIpGoogleAccess: boolean;
    purpose: string | null;
    creationTimestamp: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpFirewallRule = {
    id: string;
    cloudAccountId: string;
    gcpFirewallId: string;
    name: string;
    description: string | null;
    networkName: string | null;
    direction: string;
    priority: number;
    allowed: Record<string, unknown>[] | null;
    denied: Record<string, unknown>[] | null;
    sourceRanges: string[] | null;
    targetTags: string[] | null;
    disabled: boolean;
    creationTimestamp: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpStorageBucket = {
    id: string;
    cloudAccountId: string;
    gcpBucketId: string;
    name: string;
    location: string;
    locationType: string | null;
    storageClass: string;
    versioningEnabled: boolean;
    publicAccessPrevention: string | null;
    uniformBucketLevelAccess: boolean;
    labels: Record<string, string> | null;
    timeCreated: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpSqlInstance = {
    id: string;
    cloudAccountId: string;
    gcpInstanceId: string;
    name: string;
    databaseVersion: string;
    region: string;
    state: string;
    tier: string | null;
    ipAddresses: Record<string, unknown>[] | null;
    diskType: string | null;
    diskSizeGb: number | null;
    backupEnabled: boolean;
    availabilityType: string | null;
    userLabels: Record<string, string> | null;
    createTime: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpServiceAccount = {
    id: string;
    cloudAccountId: string;
    gcpUniqueId: string | null;
    email: string;
    displayName: string | null;
    description: string | null;
    disabled: boolean;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type GcpGkeCluster = {
    id: string;
    cloudAccountId: string;
    gcpClusterId: string;
    name: string;
    location: string;
    status: string;
    nodeCount: number | null;
    currentMasterVersion: string | null;
    currentNodeVersion: string | null;
    endpoint: string | null;
    networkName: string | null;
    subnetwork: string | null;
    resourceLabels: Record<string, string> | null;
    createTime: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export async function fetchGcpInstances(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/compute/accounts/${encodeURIComponent(cloudAccountId)}/instances?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpNetworks(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/networking/accounts/${encodeURIComponent(cloudAccountId)}/networks?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpSubnetworks(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/networking/accounts/${encodeURIComponent(cloudAccountId)}/subnetworks?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpFirewallRules(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/networking/accounts/${encodeURIComponent(cloudAccountId)}/firewall-rules?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpBuckets(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/storage/accounts/${encodeURIComponent(cloudAccountId)}/buckets?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpSqlInstances(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/sql/accounts/${encodeURIComponent(cloudAccountId)}/instances?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpServiceAccounts(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/iam/accounts/${encodeURIComponent(cloudAccountId)}/service-accounts?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}

export async function fetchGcpGkeClusters(organizationId: string, cloudAccountId: string) {
    return fetch(
        `/api/gcp/gke/accounts/${encodeURIComponent(cloudAccountId)}/clusters?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: 'no-store' }
    );
}
