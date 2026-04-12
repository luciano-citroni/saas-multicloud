# Governance Progress

## Current Step
GCP governance support — COMPLETED (2026-04-07)

## Completed

### Phase 1 — GCP Policy Engine (11 policies)
- [x] `gcp-storage-public-access` — CRITICAL — Bucket Public Access Prevention not enforced
- [x] `gcp-storage-uniform-access` — HIGH — Bucket without Uniform Bucket-Level Access
- [x] `gcp-storage-versioning-disabled` — MEDIUM — Bucket without Object Versioning
- [x] `gcp-firewall-open-ssh` — CRITICAL — Firewall allows SSH (port 22) from 0.0.0.0/0
- [x] `gcp-firewall-open-rdp` — CRITICAL — Firewall allows RDP (port 3389) from 0.0.0.0/0
- [x] `gcp-firewall-open-database-ports` — CRITICAL — Firewall exposes DB ports to internet
- [x] `gcp-vm-public-ip` — HIGH — VM instance has a public external IP
- [x] `gcp-vm-required-labels` — MEDIUM — VM missing env/environment label
- [x] `gcp-sql-backup-disabled` — HIGH — Cloud SQL without automated backups
- [x] `gcp-sql-public-ip` — CRITICAL — Cloud SQL with public IP (PRIMARY type)
- [x] `gcp-gke-logging-disabled` — HIGH — GKE cluster without Cloud Logging

### Phase 2 — Service Layer
- [x] `GovernanceScanService` extended — added GCP repos + `loadGcpResources()` + `GcpScanResources` interface
- [x] `evaluatePolicies()` now accepts `provider: string` instead of hardcoding `'aws'`
- [x] `resolveResourcesForPolicy()` handles both AWS and GCP resource types
- [x] AWS scan fully backward-compatible (`AwsScanResources` = old `ScanResources`)

### Phase 3 — Orchestration
- [x] `GovernanceProcessor` — `GovernanceJobPayload` now includes `provider: string`
- [x] Provider passed to `loadResources()` and `evaluatePolicies()` in processor
- [x] `GovernanceService.startScan()` — reads `provider` from `CloudAccount` entity
- [x] `listPolicies()` now accepts optional `provider` filter param

### Phase 4 — Module Registration
- [x] `governance.module.ts` — imports GCP entities: `GcpStorageBucket`, `GcpFirewallRule`, `GcpVmInstance`, `GcpSqlInstance`, `GcpGkeCluster`
- [x] All 11 GCP policies registered as providers

## Pending
_Nothing pending for core GCP governance support._

Future enhancements (not in scope):
- Azure governance policies
- Cross-cloud FinOps × governance integration (risk + cost scoring)
- Alert notifications for new critical findings

## Created Structure

```
backend/src/governance/
├── governance.module.ts              ← updated: GCP entities + policies
├── policies/
│   ├── policy-registry.service.ts   ← updated: 11 GCP policies added
│   ├── aws/                         ← unchanged (8 AWS policies)
│   └── gcp/                         ← NEW folder
│       ├── gcp-storage-public-access.policy.ts
│       ├── gcp-storage-uniform-access.policy.ts
│       ├── gcp-storage-versioning-disabled.policy.ts
│       ├── gcp-firewall-open-ssh.policy.ts
│       ├── gcp-firewall-open-rdp.policy.ts
│       ├── gcp-firewall-open-database-ports.policy.ts
│       ├── gcp-vm-public-ip.policy.ts
│       ├── gcp-vm-required-labels.policy.ts
│       ├── gcp-sql-backup-disabled.policy.ts
│       ├── gcp-sql-public-ip.policy.ts
│       └── gcp-gke-logging-disabled.policy.ts
├── processors/
│   └── governance.processor.ts      ← updated: provider in payload
└── services/
    ├── governance.service.ts         ← updated: reads provider from CloudAccount
    └── governance-scan.service.ts    ← updated: GCP repos + multi-provider scan
```

## Notes

### Provider Detection
Provider is read from `cloud_accounts.provider` (enum: aws | azure | gcp). No breaking changes — existing AWS scans continue to work unchanged, they now receive `provider: 'aws'` explicitly instead of being hardcoded.

### GCP Resource → Policy Mapping
| Entity | Table | Policies |
|--------|-------|----------|
| `GcpStorageBucket` | `gcp_storage_buckets` | public-access, uniform-access, versioning |
| `GcpFirewallRule` | `gcp_firewall_rules` | open-ssh, open-rdp, open-database-ports |
| `GcpVmInstance` | `gcp_vm_instances` | public-ip, required-labels |
| `GcpSqlInstance` | `gcp_sql_instances` | backup-disabled, public-ip |
| `GcpGkeCluster` | `gcp_gke_clusters` | logging-disabled |

### Score Calculation
Same weighted formula as AWS:
- critical = 40 pts, high = 20, medium = 10, low = 5
- Score = (compliant weight sum) / (total weight) × 100

### Multi-tenancy
Fully preserved — all GCP resource queries filter by `cloudAccountId`, which is owned by a single organization via `TenantGuard`.

### Dependencies
GCP resources must be synced first via the GCP assessment/inventory module before governance can evaluate them. Empty tables result in score = 100 (no violations found).
