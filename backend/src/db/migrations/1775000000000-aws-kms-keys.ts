import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsKmsKeys1775000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_kms_keys',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'aws_key_id', type: 'varchar', length: '255', isNullable: false, isUnique: true },
                    { name: 'key_arn', type: 'varchar', length: '1024', isNullable: false },
                    { name: 'description', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'key_state', type: 'varchar', length: '30', isNullable: true },
                    { name: 'key_usage', type: 'varchar', length: '50', isNullable: true },
                    { name: 'key_manager', type: 'varchar', length: '20', isNullable: true },
                    { name: 'key_spec', type: 'varchar', length: '50', isNullable: true },
                    { name: 'origin', type: 'varchar', length: '30', isNullable: true },
                    { name: 'key_rotation_enabled', type: 'boolean', isNullable: true },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'deletion_date', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_kms_keys',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex('aws_kms_keys', new TableIndex({ name: 'idx_aws_kms_keys_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_kms_keys', new TableIndex({ name: 'idx_aws_kms_keys_key_state', columnNames: ['key_state'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_kms_keys');
    }
}
