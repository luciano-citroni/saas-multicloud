import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ListQueuesCommand,
    GetQueueAttributesCommand,
    ListQueueTagsCommand,
} from '@aws-sdk/client-sqs';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsSqsQueue } from '../../db/entites';

@Injectable()
export class AwsSqsService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsSqsQueue)
        private readonly queueRepository: Repository<AwsSqsQueue>
    ) {}

    async listQueuesFromDatabase(cloudAccountId: string) {
        return this.queueRepository.find({ where: { cloudAccountId }, order: { queueName: 'ASC' } });
    }

    async getQueueById(queueId: string, cloudAccountId: string) {
        const queue = await this.queueRepository.findOne({ where: { id: queueId, cloudAccountId } });
        if (!queue) {
            throw new BadRequestException(`Fila SQS com ID "${queueId}" não encontrada.`);
        }
        return queue;
    }

    async syncQueuesFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getSqsClient(cloudAccountId, organizationId);

        const { QueueUrls } = await client.send(new ListQueuesCommand({ MaxResults: 1000 })).catch(() => {
            throw new BadRequestException('Falha ao listar filas SQS. Verifique as permissões da role (sqs:ListQueues).');
        });

        if (!QueueUrls || QueueUrls.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: Record<string, any>[] = [];

        for (const queueUrl of QueueUrls) {
            const { Attributes } = await client
                .send(
                    new GetQueueAttributesCommand({
                        QueueUrl: queueUrl,
                        AttributeNames: [
                            'QueueArn',
                            'VisibilityTimeout',
                            'MessageRetentionPeriod',
                            'MaximumMessageSize',
                            'DelaySeconds',
                            'ApproximateNumberOfMessages',
                            'RedrivePolicy',
                            'KmsMasterKeyId',
                            'FifoQueue',
                            'ContentBasedDeduplication',
                            'CreatedTimestamp',
                        ],
                    })
                )
                .catch(() => {
                    console.warn(`Não foi possível obter atributos da fila ${queueUrl}.`);
                    return { Attributes: {} };
                });

            let tags: Record<string, string> = {};
            try {
                const { Tags } = await client.send(new ListQueueTagsCommand({ QueueUrl: queueUrl }));
                tags = Tags ?? {};
            } catch {
                console.warn(`Não foi possível obter tags da fila ${queueUrl}.`);
            }

            const queueName = queueUrl.split('/').pop() ?? '';
            const attrs: Record<string, string> = Attributes ?? {};
            const isFifo = attrs.FifoQueue === 'true';
            const redrivePolicy = attrs.RedrivePolicy ? JSON.parse(attrs.RedrivePolicy) : null;

            const queueData = {
                queueUrl,
                queueArn: attrs.QueueArn ?? null,
                queueName,
                isFifo,
                visibilityTimeout: attrs.VisibilityTimeout ? parseInt(attrs.VisibilityTimeout) : null,
                messageRetentionPeriod: attrs.MessageRetentionPeriod ? parseInt(attrs.MessageRetentionPeriod) : null,
                maximumMessageSize: attrs.MaximumMessageSize ? parseInt(attrs.MaximumMessageSize) : null,
                delaySeconds: attrs.DelaySeconds ? parseInt(attrs.DelaySeconds) : null,
                approximateNumberOfMessages: attrs.ApproximateNumberOfMessages ? parseInt(attrs.ApproximateNumberOfMessages) : null,
                deadLetterQueueArn: redrivePolicy?.deadLetterTargetArn ?? null,
                kmsMasterKeyId: attrs.KmsMasterKeyId ?? null,
                contentBasedDeduplication: attrs.ContentBasedDeduplication === 'true',
                createdAtAws: attrs.CreatedTimestamp ? new Date(parseInt(attrs.CreatedTimestamp) * 1000) : null,
            };

            mapped.push(queueData);

            let dbQueue = await this.queueRepository.findOne({ where: { queueUrl } });

            if (dbQueue) {
                Object.assign(dbQueue, queueData, { tags, lastSyncedAt: now });
            } else {
                dbQueue = this.queueRepository.create({ cloudAccountId, ...queueData, tags, lastSyncedAt: now });
            }

            await this.queueRepository.save(dbQueue);
        }

        return mapped;
    }
}
