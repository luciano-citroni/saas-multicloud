import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ListKeysCommand,
    DescribeKeyCommand,
    GetKeyRotationStatusCommand,
    ListResourceTagsCommand,
    type KeyMetadata,
} from '@aws-sdk/client-kms';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsKmsKey } from '../../db/entites';

@Injectable()
export class AwsKmsService {
    private readonly logger = new Logger(AwsKmsService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsKmsKey)
        private readonly kmsRepository: Repository<AwsKmsKey>
    ) {}

    async listKeysFromDatabase(cloudAccountId: string) {
        return this.kmsRepository.find({ where: { cloudAccountId }, order: { keyState: 'ASC' } });
    }

    async getKeyById(keyId: string, cloudAccountId: string) {
        const key = await this.kmsRepository.findOne({ where: { id: keyId, cloudAccountId } });
        if (!key) {
            throw new BadRequestException(`Chave KMS com ID "${keyId}" não encontrada.`);
        }
        return key;
    }

    async syncKeysFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getKmsClient(cloudAccountId, organizationId);

        const { Keys } = await client.send(new ListKeysCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar chaves KMS. Verifique as permissões da role (kms:ListKeys).');
        });

        if (!Keys || Keys.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsKey>[] = [];

        for (const key of Keys) {
            if (!key.KeyId) continue;

            const { KeyMetadata } = await client.send(new DescribeKeyCommand({ KeyId: key.KeyId })).catch(() => {
                throw new BadRequestException(`Falha ao descrever a chave KMS ${key.KeyId}. Verifique as permissões (kms:DescribeKey).`);
            });

            if (!KeyMetadata) continue;

            let keyRotationEnabled: boolean | null = null;
            if (KeyMetadata.KeyManager === 'CUSTOMER' && KeyMetadata.KeyState === 'Enabled') {
                try {
                    const { KeyRotationEnabled } = await client.send(new GetKeyRotationStatusCommand({ KeyId: key.KeyId }));
                    keyRotationEnabled = KeyRotationEnabled ?? null;
                } catch {
                    this.logger.debug(`Não foi possível verificar rotação da chave ${key.KeyId}.`);
                }
            }

            let tags: Record<string, string> = {};
            try {
                const { Tags } = await client.send(new ListResourceTagsCommand({ KeyId: key.KeyId }));
                tags = Tags?.reduce<Record<string, string>>((acc, t) => {
                    if (t.TagKey) acc[t.TagKey] = t.TagValue ?? '';
                    return acc;
                }, {}) ?? {};
            } catch {
                this.logger.debug(`Não foi possível obter tags da chave ${key.KeyId}.`);
            }

            const keyData = mapAwsKey(KeyMetadata, keyRotationEnabled, tags);
            mapped.push(keyData);

            let dbKey = await this.kmsRepository.findOne({ where: { awsKeyId: KeyMetadata.KeyId! } });

            if (dbKey) {
                dbKey.keyArn = keyData.keyArn;
                dbKey.description = keyData.description;
                dbKey.keyState = keyData.keyState;
                dbKey.keyUsage = keyData.keyUsage;
                dbKey.keyManager = keyData.keyManager;
                dbKey.keySpec = keyData.keySpec;
                dbKey.origin = keyData.origin;
                dbKey.keyRotationEnabled = keyRotationEnabled;
                dbKey.deletionDate = keyData.deletionDate;
                dbKey.tags = tags;
                dbKey.lastSyncedAt = now;
            } else {
                dbKey = this.kmsRepository.create({
                    cloudAccountId,
                    ...keyData,
                    keyRotationEnabled,
                    tags,
                    lastSyncedAt: now,
                });
            }

            await this.kmsRepository.save(dbKey);
        }

        return mapped;
    }
}

function mapAwsKey(km: KeyMetadata, keyRotationEnabled: boolean | null, tags: Record<string, string>) {
    return {
        awsKeyId: km.KeyId ?? '',
        keyArn: km.Arn ?? '',
        description: km.Description ?? null,
        keyState: km.KeyState ?? null,
        keyUsage: km.KeyUsage ?? null,
        keyManager: km.KeyManager ?? null,
        keySpec: km.KeySpec ?? null,
        origin: km.Origin ?? null,
        keyRotationEnabled,
        createdAtAws: km.CreationDate ?? null,
        deletionDate: km.DeletionDate ?? null,
        tags,
    };
}
