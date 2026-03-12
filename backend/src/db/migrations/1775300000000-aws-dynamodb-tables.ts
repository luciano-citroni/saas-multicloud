import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsDynamoDbTables1775300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_dynamodb_tables',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'table_arn', type: 'varchar', length: '1024', isNullable: false, isUnique: true },
                    { name: 'table_id', type: 'varchar', length: '255', isNullable: true },
                    { name: 'table_name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'table_status', type: 'varchar', length: '50', isNullable: true },
                    { name: 'billing_mode', type: 'varchar', length: '30', isNullable: true },
                    { name: 'item_count', type: 'bigint', isNullable: true },
                    { name: 'table_size_bytes', type: 'bigint', isNullable: true },
                    { name: 'read_capacity_units', type: 'int', isNullable: true },
                    { name: 'write_capacity_units', type: 'int', isNullable: true },
                    { name: 'sse_type', type: 'varchar', length: '10', isNullable: true },
                    { name: 'sse_kms_master_key_arn', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'point_in_time_recovery_enabled', type: 'boolean', isNullable: true },
                    { name: 'global_secondary_indexes', type: 'jsonb', isNullable: true },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_dynamodb_tables', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createIndex('aws_dynamodb_tables', new TableIndex({ name: 'idx_aws_dynamodb_tables_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_dynamodb_tables', new TableIndex({ name: 'idx_aws_dynamodb_tables_table_name', columnNames: ['table_name'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_dynamodb_tables');
    }
}
