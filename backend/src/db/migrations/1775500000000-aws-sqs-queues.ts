import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsSqsQueues1775500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_sqs_queues',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'queue_url', type: 'varchar', length: '2048', isNullable: false, isUnique: true },
                    { name: 'queue_arn', type: 'varchar', length: '2048', isNullable: true },
                    { name: 'queue_name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'is_fifo', type: 'boolean', default: false },
                    { name: 'visibility_timeout', type: 'int', isNullable: true },
                    { name: 'message_retention_period', type: 'int', isNullable: true },
                    { name: 'maximum_message_size', type: 'int', isNullable: true },
                    { name: 'delay_seconds', type: 'int', isNullable: true },
                    { name: 'approximate_number_of_messages', type: 'int', isNullable: true },
                    { name: 'dead_letter_queue_arn', type: 'varchar', length: '2048', isNullable: true },
                    { name: 'kms_master_key_id', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'content_based_deduplication', type: 'boolean', default: false },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_sqs_queues',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_sqs_queues',
            new TableIndex({ name: 'idx_aws_sqs_queues_cloud_account_id', columnNames: ['cloud_account_id'] })
        );
        await queryRunner.createIndex('aws_sqs_queues', new TableIndex({ name: 'idx_aws_sqs_queues_queue_name', columnNames: ['queue_name'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_sqs_queues');
    }
}
