import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { ListSecretsCommand, type SecretListEntry } from '@aws-sdk/client-secrets-manager';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsSecretsManagerSecret } from '../../db/entites';

@Injectable()
export class AwsSecretsManagerService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsSecretsManagerSecret)
        private readonly secretRepository: Repository<AwsSecretsManagerSecret>
    ) {}

    async listSecretsFromDatabase(cloudAccountId: string) {
        return this.secretRepository.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getSecretById(secretId: string, cloudAccountId: string) {
        const secret = await this.secretRepository.findOne({ where: { id: secretId, cloudAccountId } });

        if (!secret) {
            throw new BadRequestException(`Secret com ID "${secretId}" não encontrado.`);
        }

        return secret;
    }

    async syncSecretsFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getSecretsManagerClient(cloudAccountId, organizationId);

        const { SecretList } = await client.send(new ListSecretsCommand({ IncludePlannedDeletion: true })).catch(() => {
            throw new BadRequestException('Falha ao listar secrets do Secrets Manager. Verifique as permissões da role (secretsmanager:ListSecrets).');
        });

        if (!SecretList || SecretList.length === 0) {
            return [];
        }

        const now = new Date();

        const mapped: ReturnType<typeof mapAwsSecret>[] = [];

        for (const secret of SecretList) {
            if (!secret.ARN) continue;

            const secretData = mapAwsSecret(secret);

            mapped.push(secretData);

            let dbSecret = await this.secretRepository.findOne({ where: { secretArn: secretData.secretArn } });

            if (dbSecret) {
                dbSecret.name = secretData.name;

                dbSecret.description = secretData.description;

                dbSecret.kmsKeyId = secretData.kmsKeyId;

                dbSecret.rotationEnabled = secretData.rotationEnabled;

                dbSecret.rotationRulesAutomaticallyAfterDays = secretData.rotationRulesAutomaticallyAfterDays;

                dbSecret.lastRotatedDate = secretData.lastRotatedDate;

                dbSecret.lastAccessedDate = secretData.lastAccessedDate;

                dbSecret.deletedDate = secretData.deletedDate;

                dbSecret.tags = secretData.tags;

                dbSecret.lastSyncedAt = now;
            } else {
                dbSecret = this.secretRepository.create({
                    cloudAccountId,

                    ...secretData,

                    lastSyncedAt: now,
                });
            }

            await this.secretRepository.save(dbSecret);
        }

        return mapped;
    }
}

function mapAwsSecret(s: SecretListEntry) {
    return {
        secretArn: s.ARN ?? '',

        name: s.Name ?? '',

        description: s.Description ?? null,

        kmsKeyId: s.KmsKeyId ?? null,

        rotationEnabled: s.RotationEnabled ?? false,

        rotationRulesAutomaticallyAfterDays: s.RotationRules?.AutomaticallyAfterDays ?? null,

        lastRotatedDate: s.LastRotatedDate ?? null,

        lastAccessedDate: s.LastAccessedDate ?? null,

        deletedDate: s.DeletedDate ?? null,

        createdAtAws: s.CreatedDate ?? null,

        tags: parseTags(s.Tags),
    };
}

function parseTags(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
    if (!tags) return {};

    return tags.reduce<Record<string, string>>((acc, { Key, Value }) => {
        if (Key) acc[Key] = Value ?? '';

        return acc;
    }, {});
}
