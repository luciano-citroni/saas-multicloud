import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ListTopicsCommand,
    GetTopicAttributesCommand,
    ListTagsForResourceCommand,
} from '@aws-sdk/client-sns';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsSnsTopic } from '../../db/entites';

@Injectable()
export class AwsSnsService {
    private readonly logger = new Logger(AwsSnsService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsSnsTopic)
        private readonly topicRepository: Repository<AwsSnsTopic>
    ) {}

    async listTopicsFromDatabase(cloudAccountId: string) {
        return this.topicRepository.find({ where: { cloudAccountId }, order: { topicName: 'ASC' } });
    }

    async getTopicById(topicId: string, cloudAccountId: string) {
        const topic = await this.topicRepository.findOne({ where: { id: topicId, cloudAccountId } });
        if (!topic) {
            throw new BadRequestException(`Tópico SNS com ID "${topicId}" não encontrado.`);
        }
        return topic;
    }

    async syncTopicsFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getSnsClient(cloudAccountId, organizationId);

        const { Topics } = await client.send(new ListTopicsCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar tópicos SNS. Verifique as permissões da role (sns:ListTopics).');
        });

        if (!Topics || Topics.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: Record<string, any>[] = [];

        for (const topic of Topics) {
            if (!topic.TopicArn) continue;

            const { Attributes } = await client.send(new GetTopicAttributesCommand({ TopicArn: topic.TopicArn })).catch(() => {
                this.logger.debug(`Não foi possível obter atributos do tópico ${topic.TopicArn}.`);
                return { Attributes: {} };
            });

            let tags: Record<string, string> = {};
            try {
                const { Tags } = await client.send(new ListTagsForResourceCommand({ ResourceArn: topic.TopicArn }));
                tags = Tags?.reduce<Record<string, string>>((acc, t) => {
                    if (t.Key) acc[t.Key] = t.Value ?? '';
                    return acc;
                }, {}) ?? {};
            } catch {
                this.logger.debug(`Não foi possível obter tags do tópico ${topic.TopicArn}.`);
            }

            const attrs: Record<string, string> = Attributes ?? {};
            const topicName = topic.TopicArn.split(':').pop() ?? '';
            const isFifo = topicName.endsWith('.fifo');

            const topicData = {
                topicArn: topic.TopicArn,
                topicName,
                displayName: attrs.DisplayName ?? null,
                subscriptionsConfirmed: attrs.SubscriptionsConfirmed ? parseInt(attrs.SubscriptionsConfirmed) : null,
                subscriptionsPending: attrs.SubscriptionsPending ? parseInt(attrs.SubscriptionsPending) : null,
                subscriptionsDeleted: attrs.SubscriptionsDeleted ? parseInt(attrs.SubscriptionsDeleted) : null,
                isFifo,
                kmsMasterKeyId: attrs.KmsMasterKeyId ?? null,
                contentBasedDeduplication: attrs.ContentBasedDeduplication === 'true',
            };

            mapped.push(topicData);

            let dbTopic = await this.topicRepository.findOne({ where: { topicArn: topic.TopicArn } });

            if (dbTopic) {
                Object.assign(dbTopic, topicData, { tags, lastSyncedAt: now });
            } else {
                dbTopic = this.topicRepository.create({ cloudAccountId, ...topicData, tags, lastSyncedAt: now });
            }

            await this.topicRepository.save(dbTopic);
        }

        return mapped;
    }
}
