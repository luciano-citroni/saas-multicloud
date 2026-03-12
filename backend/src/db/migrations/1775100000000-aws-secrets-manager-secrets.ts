import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsSecretsManagerSecrets1775100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_secrets_manager_secrets',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'secret_arn', type: 'varchar', length: '2048', isNullable: false, isUnique: true },
                    { name: 'name', type: 'varchar', length: '512', isNullable: false },
                    { name: 'description', type: 'varchar', length: '2048', isNullable: true },
                    { name: 'kms_key_id', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'rotation_enabled', type: 'boolean', default: false },
                    { name: 'rotation_rules_automatically_after_days', type: 'int', isNullable: true },
                    { name: 'last_rotated_date', type: 'timestamptz', isNullable: true },
                    { name: 'last_accessed_date', type: 'timestamptz', isNullable: true },
                    { name: 'deleted_date', type: 'timestamptz', isNullable: true },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_secrets_manager_secrets', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createIndex('aws_secrets_manager_secrets', new TableIndex({ name: 'idx_aws_secrets_manager_secrets_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_secrets_manager_secrets', new TableIndex({ name: 'idx_aws_secrets_manager_secrets_name', columnNames: ['name'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_secrets_manager_secrets');
    }
}
