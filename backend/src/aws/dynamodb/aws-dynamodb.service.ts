import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import {
    ListTablesCommand,
    DescribeTableCommand,
    ListTagsOfResourceCommand,
    DescribeContinuousBackupsCommand,
    type TableDescription,
} from '@aws-sdk/client-dynamodb';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsDynamoDbTable } from '../../db/entites';

@Injectable()
export class AwsDynamoDbService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsDynamoDbTable)
        private readonly tableRepository: Repository<AwsDynamoDbTable>
    ) {}

    async listTablesFromDatabase(cloudAccountId: string) {
        return this.tableRepository.find({ where: { cloudAccountId }, order: { tableName: 'ASC' } });
    }

    async getTableById(tableId: string, cloudAccountId: string) {
        const table = await this.tableRepository.findOne({ where: { id: tableId, cloudAccountId } });

        if (!table) {
            throw new BadRequestException(`Tabela DynamoDB com ID "${tableId}" não encontrada.`);
        }

        return table;
    }

    async syncTablesFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getDynamoDbClient(cloudAccountId, organizationId);

        const { TableNames } = await client.send(new ListTablesCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar tabelas DynamoDB. Verifique as permissões da role (dynamodb:ListTables).');
        });

        if (!TableNames || TableNames.length === 0) {
            return [];
        }

        const now = new Date();

        const mapped: ReturnType<typeof mapAwsTable>[] = [];

        for (const tableName of TableNames) {
            const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName })).catch(() => {
                throw new BadRequestException(`Falha ao descrever a tabela DynamoDB "${tableName}". Verifique as permissões (dynamodb:DescribeTable).`);
            });

            if (!Table?.TableArn) continue;

            let pointInTimeRecoveryEnabled: boolean | null = null;

            try {
                const { ContinuousBackupsDescription } = await client.send(new DescribeContinuousBackupsCommand({ TableName: tableName }));

                pointInTimeRecoveryEnabled = ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === 'ENABLED';
            } catch {
                console.warn(`Não foi possível verificar PITR da tabela ${tableName}.`);
            }

            let tags: Record<string, string> = {};

            try {
                const { Tags } = await client.send(new ListTagsOfResourceCommand({ ResourceArn: Table.TableArn }));

                tags =
                    Tags?.reduce<Record<string, string>>((acc, t) => {
                        if (t.Key) acc[t.Key] = t.Value ?? '';

                        return acc;
                    }, {}) ?? {};
            } catch {
                console.warn(`Não foi possível obter tags da tabela ${tableName}.`);
            }

            const tableData = mapAwsTable(Table, pointInTimeRecoveryEnabled, tags);

            mapped.push(tableData);

            let dbTable = await this.tableRepository.findOne({ where: { tableArn: Table.TableArn } });

            if (dbTable) {
                dbTable.tableId = tableData.tableId;

                dbTable.tableName = tableData.tableName;

                dbTable.tableStatus = tableData.tableStatus;

                dbTable.billingMode = tableData.billingMode;

                dbTable.itemCount = tableData.itemCount;

                dbTable.tableSizeBytes = tableData.tableSizeBytes;

                dbTable.readCapacityUnits = tableData.readCapacityUnits;

                dbTable.writeCapacityUnits = tableData.writeCapacityUnits;

                dbTable.sseType = tableData.sseType;

                dbTable.ssKmsMasterKeyArn = tableData.ssKmsMasterKeyArn;

                dbTable.pointInTimeRecoveryEnabled = pointInTimeRecoveryEnabled;

                dbTable.globalSecondaryIndexes = tableData.globalSecondaryIndexes;

                dbTable.tags = tags;

                dbTable.lastSyncedAt = now;
            } else {
                dbTable = this.tableRepository.create({
                    cloudAccountId,

                    ...tableData,

                    pointInTimeRecoveryEnabled,

                    tags,

                    lastSyncedAt: now,
                });
            }

            await this.tableRepository.save(dbTable);
        }

        return mapped;
    }
}

function mapAwsTable(t: TableDescription, pointInTimeRecoveryEnabled: boolean | null, tags: Record<string, string>) {
    const billing = t.BillingModeSummary?.BillingMode ?? (t.ProvisionedThroughput ? 'PROVISIONED' : null);

    return {
        tableArn: t.TableArn ?? '',

        tableId: t.TableId ?? null,

        tableName: t.TableName ?? '',

        tableStatus: t.TableStatus ?? null,

        billingMode: billing,

        itemCount: t.ItemCount ?? null,

        tableSizeBytes: t.TableSizeBytes ?? null,

        readCapacityUnits: t.ProvisionedThroughput?.ReadCapacityUnits ?? null,

        writeCapacityUnits: t.ProvisionedThroughput?.WriteCapacityUnits ?? null,

        sseType: t.SSEDescription?.SSEType ?? null,

        ssKmsMasterKeyArn: t.SSEDescription?.KMSMasterKeyArn ?? null,

        pointInTimeRecoveryEnabled,

        globalSecondaryIndexes:
            t.GlobalSecondaryIndexes?.map((idx) => ({
                indexName: idx.IndexName,

                indexStatus: idx.IndexStatus,

                itemCount: idx.ItemCount,
            })) ?? null,

        createdAtAws: t.CreationDateTime ?? null,

        tags,
    };
}
