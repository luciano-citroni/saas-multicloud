import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsWafWebAcls1775700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_waf_web_acls',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'aws_web_acl_id', type: 'varchar', length: '255', isNullable: false },
                    { name: 'web_acl_arn', type: 'varchar', length: '2048', isNullable: false, isUnique: true },
                    { name: 'name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'description', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'scope', type: 'varchar', length: '20', isNullable: false },
                    { name: 'capacity', type: 'int', isNullable: true },
                    { name: 'default_action', type: 'varchar', length: '10', isNullable: true },
                    { name: 'rules_count', type: 'int', isNullable: true },
                    { name: 'associated_resources', type: 'jsonb', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_waf_web_acls',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_waf_web_acls',
            new TableIndex({ name: 'idx_aws_waf_web_acls_cloud_account_id', columnNames: ['cloud_account_id'] })
        );
        await queryRunner.createIndex('aws_waf_web_acls', new TableIndex({ name: 'idx_aws_waf_web_acls_name', columnNames: ['name'] }));
        await queryRunner.createIndex('aws_waf_web_acls', new TableIndex({ name: 'idx_aws_waf_web_acls_scope', columnNames: ['scope'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_waf_web_acls');
    }
}
