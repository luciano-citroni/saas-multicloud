import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiFinopsProviderUser } from '../../db/entites/ai-finops-provider-user.entity';
import type { AiProviderUserInfo } from '../providers/ai-provider.adapter';

@Injectable()
export class AiFinopsProviderUserService {
    constructor(
        @InjectRepository(AiFinopsProviderUser)
        private readonly providerUserRepository: Repository<AiFinopsProviderUser>,
    ) {}

    async upsertMany(input: {
        tenantId: string;
        connectionId: string | null;
        provider: string;
        users: AiProviderUserInfo[];
    }): Promise<number> {
        if (input.users.length === 0) return 0;
        const now = new Date();
        let saved = 0;

        for (const user of input.users) {
            const externalId = user.externalId?.trim();
            if (!externalId) continue;

            const existing = await this.providerUserRepository.findOne({
                where: {
                    tenantId: input.tenantId,
                    provider: input.provider,
                    externalId,
                },
            });

            if (existing) {
                existing.connectionId = input.connectionId ?? existing.connectionId;
                existing.email = user.email?.trim() || existing.email;
                existing.name = user.name?.trim() || existing.name;
                existing.role = user.role?.trim() || existing.role;
                existing.metadata = { ...(existing.metadata ?? {}), ...(user.metadata ?? {}) };
                existing.syncedAt = now;
                await this.providerUserRepository.save(existing);
            } else {
                await this.providerUserRepository.save(
                    this.providerUserRepository.create({
                        tenantId: input.tenantId,
                        connectionId: input.connectionId,
                        provider: input.provider,
                        externalId,
                        email: user.email?.trim() || null,
                        name: user.name?.trim() || null,
                        role: user.role?.trim() || null,
                        metadata: user.metadata ?? {},
                        syncedAt: now,
                    }),
                );
            }
            saved += 1;
        }

        return saved;
    }

    private idVariants(externalId: string): string[] {
        const id = externalId.trim();
        if (!id) return [];
        const variants = new Set<string>([id]);
        if (id.startsWith('user-')) variants.add(`user_${id.slice(5)}`);
        if (id.startsWith('user_')) variants.add(`user-${id.slice(5)}`);
        return Array.from(variants);
    }

    async resolveLabels(tenantId: string, keys: string[]): Promise<Map<string, string>> {
        const unique = Array.from(
            new Set(keys.map((key) => key?.trim()).filter((key): key is string => Boolean(key))),
        );
        const labels = new Map<string, string>();
        if (unique.length === 0) return labels;

        const lookupIds = Array.from(new Set(unique.flatMap((key) => this.idVariants(key))));
        const rows = await this.providerUserRepository.find({
            where: {
                tenantId,
                externalId: In(lookupIds),
            },
        });

        const labelByExternalId = new Map<string, string>();
        for (const row of rows) {
            const label = row.name?.trim() || row.email?.trim() || null;
            if (label) labelByExternalId.set(row.externalId, label);
        }

        for (const key of unique) {
            for (const variant of this.idVariants(key)) {
                const label = labelByExternalId.get(variant);
                if (label) {
                    labels.set(key, label);
                    break;
                }
            }
        }

        return labels;
    }

    labelFor(key: string, labels: Map<string, string>): string {
        return labels.get(key) ?? key;
    }

    async listNamedUsers(tenantId: string, provider: string, connectionId?: string | null) {
        const where: { tenantId: string; provider: string; connectionId?: string } = {
            tenantId,
            provider,
        };
        if (connectionId) where.connectionId = connectionId;
        const rows = await this.providerUserRepository.find({ where });
        return rows.filter((row) => Boolean(row.name?.trim() || row.email?.trim()));
    }
}
