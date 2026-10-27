import { Repository } from 'typeorm';

import { CloudAccount } from '../../db/entites/cloud-account.entity';

/**
 * Contas cloud são indexadas principalmente por `tenant_id`.
 * O header `x-organization-id` carrega o UUID do tenant (CurrentOrganization).
 * `organization_id` pode estar nulo em contas antigas — aceita os dois.
 */
export async function findCloudAccountForTenant(
    repo: Repository<CloudAccount>,
    cloudAccountId: string,
    tenantId: string,
    options?: { withCredentials?: boolean }
): Promise<CloudAccount | null> {
    const qb = repo
        .createQueryBuilder('ca')
        .where('ca.id = :cloudAccountId', { cloudAccountId })
        .andWhere('(ca.tenantId = :tenantId OR ca.organizationId = :tenantId)', { tenantId });

    if (options?.withCredentials) {
        qb.addSelect('ca.credentialsEncrypted');
    }

    return qb.getOne();
}
