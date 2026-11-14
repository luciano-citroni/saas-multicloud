import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { AiFinopsModel } from '../../db/entites/ai-finops-model.entity';
import { AiFinopsModelPricing } from '../../db/entites/ai-finops-model-pricing.entity';

@Injectable()
export class AiFinopsPricingService {
    constructor(
        @InjectRepository(AiFinopsModel)
        private readonly modelRepository: Repository<AiFinopsModel>,
        @InjectRepository(AiFinopsModelPricing)
        private readonly pricingRepository: Repository<AiFinopsModelPricing>,
    ) {}

    async upsertModel(input: {
        providerId: string;
        modelIdentifier: string;
        displayName: string;
        modality?: string | null;
        contextWindow?: number | null;
        capabilities?: Record<string, unknown>;
    }): Promise<AiFinopsModel> {
        let model = await this.modelRepository.findOne({
            where: { providerId: input.providerId, modelIdentifier: input.modelIdentifier },
        });
        if (!model) {
            model = this.modelRepository.create({
                providerId: input.providerId,
                modelIdentifier: input.modelIdentifier,
                displayName: input.displayName,
                modality: input.modality ?? null,
                contextWindow: input.contextWindow ?? null,
                capabilities: input.capabilities ?? {},
                status: 'active',
            });
        } else {
            model.displayName = input.displayName;
            model.modality = input.modality ?? model.modality;
            model.contextWindow = input.contextWindow ?? model.contextWindow;
            model.capabilities = input.capabilities ?? model.capabilities;
            model.status = 'active';
        }
        return this.modelRepository.save(model);
    }

    async findPriceAt(
        modelId: string,
        tokenType: string,
        at: Date,
    ): Promise<AiFinopsModelPricing | null> {
        return this.pricingRepository.findOne({
            where: [
                {
                    modelId,
                    tokenType,
                    effectiveFrom: LessThanOrEqual(at),
                    effectiveUntil: MoreThan(at),
                },
                {
                    modelId,
                    tokenType,
                    effectiveFrom: LessThanOrEqual(at),
                    effectiveUntil: IsNull(),
                },
            ],
            order: { effectiveFrom: 'DESC' },
        });
    }

    /**
     * Estimates cost using price per 1M tokens at the usage date.
     * Returns null when no pricing row exists for that date (never invent prices).
     */
    async estimateCost(input: {
        modelId: string;
        occurredAt: Date;
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens?: number;
    }): Promise<{ estimatedCost: number; currency: string } | null> {
        const inputPrice = await this.findPriceAt(input.modelId, 'input', input.occurredAt);
        const outputPrice = await this.findPriceAt(input.modelId, 'output', input.occurredAt);
        if (!inputPrice && !outputPrice) return null;

        let cost = 0;
        const currency = inputPrice?.currency ?? outputPrice?.currency ?? 'USD';
        if (inputPrice) {
            cost += (input.inputTokens / 1_000_000) * Number(inputPrice.price);
        }
        if (outputPrice) {
            cost += (input.outputTokens / 1_000_000) * Number(outputPrice.price);
        }
        if (input.cachedInputTokens) {
            const cachedPrice = await this.findPriceAt(input.modelId, 'cached_input', input.occurredAt);
            if (cachedPrice) {
                cost += (input.cachedInputTokens / 1_000_000) * Number(cachedPrice.price);
            }
        }
        return { estimatedCost: cost, currency };
    }

    async listModels(providerId?: string) {
        return this.modelRepository.find({
            where: providerId ? { providerId } : {},
            order: { displayName: 'ASC' },
        });
    }
}
