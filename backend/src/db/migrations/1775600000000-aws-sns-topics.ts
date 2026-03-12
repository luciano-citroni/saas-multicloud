import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsSnsTopics1775600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_sns_topics',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'topic_arn', type: 'varchar', length: '2048', isNullable: false, isUnique: true },
                    { name: 'topic_name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'display_name', type: 'varchar', length: '255', isNullable: true },
                    { name: 'subscriptions_confirmed', type: 'int', isNullable: true },
                    { name: 'subscriptions_pending', type: 'int', isNullable: true },
                    { name: 'subscriptions_deleted', type: 'int', isNullable: true },
                    { name: 'is_fifo', type: 'boolean', default: false },
                    { name: 'kms_master_key_id', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'content_based_deduplication', type: 'boolean', default: false },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_sns_topics', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createIndex('aws_sns_topics', new TableIndex({ name: 'idx_aws_sns_topics_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_sns_topics', new TableIndex({ name: 'idx_aws_sns_topics_topic_name', columnNames: ['topic_name'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_sns_topics');
    }
}
