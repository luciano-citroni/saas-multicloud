import { Injectable } from '@nestjs/common';

import { GovernancePolicy } from './policy.interface';

import { S3NoPublicAccessPolicy } from './aws/s3-no-public-access.policy';
import { S3EncryptionEnabledPolicy } from './aws/s3-encryption-enabled.policy';
import { SgNoOpenSshPolicy } from './aws/sg-no-open-ssh.policy';
import { SgNoOpenRdpPolicy } from './aws/sg-no-open-rdp.policy';
import { Ec2RequiredTagsPolicy } from './aws/ec2-required-tags.policy';
import { CloudTrailEnabledPolicy } from './aws/cloudtrail-enabled.policy';

/**
 * Registro central de todas as políticas de governança disponíveis.
 *
 * Para adicionar uma nova política:
 *  1. Crie a classe em policies/aws/ (ou policies/azure/, policies/gcp/)
 *  2. Injete aqui via construtor
 *  3. Ela será incluída automaticamente no scan
 */
@Injectable()
export class PolicyRegistryService {
    private readonly policies: GovernancePolicy[];

    constructor(
        private readonly s3NoPublicAccess: S3NoPublicAccessPolicy,
        private readonly s3EncryptionEnabled: S3EncryptionEnabledPolicy,
        private readonly sgNoOpenSsh: SgNoOpenSshPolicy,
        private readonly sgNoOpenRdp: SgNoOpenRdpPolicy,
        private readonly ec2RequiredTags: Ec2RequiredTagsPolicy,
        private readonly cloudTrailEnabled: CloudTrailEnabledPolicy
    ) {
        this.policies = [
            this.s3NoPublicAccess,
            this.s3EncryptionEnabled,
            this.sgNoOpenSsh,
            this.sgNoOpenRdp,
            this.ec2RequiredTags,
            this.cloudTrailEnabled,
        ];
    }

    /** Retorna todas as políticas registradas. */
    getAll(): GovernancePolicy[] {
        return this.policies;
    }

    /** Retorna políticas filtradas por provider ('aws', 'azure', etc). */
    getByProvider(provider: string): GovernancePolicy[] {
        return this.policies.filter((p) => p.provider === provider || p.provider === '*');
    }

    /** Retorna políticas filtradas por tipo de recurso. */
    getByResourceType(resourceType: string): GovernancePolicy[] {
        return this.policies.filter((p) => p.resourceType === resourceType);
    }

    /** Retorna uma política específica pelo seu ID. */
    getById(id: string): GovernancePolicy | undefined {
        return this.policies.find((p) => p.id === id);
    }
}
