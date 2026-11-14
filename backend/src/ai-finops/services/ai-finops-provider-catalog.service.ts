import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsProvider } from '../../db/entites/ai-finops-provider.entity';
import { AI_FINOPS_PROVIDER_SEEDS } from '../constants';
import { AiFinopsAdapterRegistry } from '../providers/adapter.registry';

@Injectable()
export class AiFinopsProviderCatalogService implements OnModuleInit {
    constructor(
        @InjectRepository(AiFinopsProvider)
        private readonly providerRepository: Repository<AiFinopsProvider>,
        private readonly adapterRegistry: AiFinopsAdapterRegistry,
    ) {}

    async onModuleInit(): Promise<void> {
        await this.ensureSeeded();
    }

    async ensureSeeded(): Promise<void> {
        for (const seed of AI_FINOPS_PROVIDER_SEEDS) {
            const existing = await this.providerRepository.findOne({ where: { slug: seed.slug } });
            const adapter = this.adapterRegistry.get(seed.slug);
            const capabilities = adapter?.capabilities ?? seed.capabilities;
            if (existing) {
                existing.name = seed.name;
                existing.description = seed.description;
                existing.capabilities = { ...capabilities };
                await this.providerRepository.save(existing);
                continue;
            }
            await this.providerRepository.save(
                this.providerRepository.create({
                    slug: seed.slug,
                    name: seed.name,
                    description: seed.description,
                    capabilities: { ...capabilities },
                    status: 'active',
                }),
            );
        }
    }

    async list(): Promise<AiFinopsProvider[]> {
        await this.ensureSeeded();
        return this.providerRepository.find({ order: { name: 'ASC' } });
    }

    async findBySlug(slug: string): Promise<AiFinopsProvider | null> {
        await this.ensureSeeded();
        return this.providerRepository.findOne({ where: { slug } });
    }
}
