import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AwsWafIpSetsNetworkAcls1782300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns('aws_waf_web_acls', [
            new TableColumn({ name: 'region', type: 'varchar', length: '32', isNullable: true }),
            new TableColumn({ name: 'rules', type: 'jsonb', isNullable: true }),
        ]);

        await queryRunner.createTable(
            new Table({
                name: 'aws_waf_ip_sets',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'aws_ip_set_id', type: 'varchar', length: '255', isNullable: false },
                    { name: 'ip_set_arn', type: 'varchar', length: '2048', isNullable: false, isUnique: true },
                    { name: 'name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'description', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'scope', type: 'varchar', length: '20', isNullable: false },
                    { name: 'region', type: 'varchar', length: '32', isNullable: true },
                    { name: 'ip_address_version', type: 'varchar', length: '10', isNullable: true },
                    { name: 'addresses', type: 'jsonb', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            }),
        );

        await queryRunner.createForeignKey(
            'aws_waf_ip_sets',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            }),
        );

        await queryRunner.createIndex(
            'aws_waf_ip_sets',
            new TableIndex({ name: 'idx_aws_waf_ip_sets_cloud_account_id', columnNames: ['cloud_account_id'] }),
        );
        await queryRunner.createIndex(
            'aws_waf_ip_sets',
            new TableIndex({ name: 'idx_aws_waf_ip_sets_scope', columnNames: ['scope'] }),
        );

        await queryRunner.createTable(
            new Table({
                name: 'aws_network_acls',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'aws_network_acl_id', type: 'varchar', length: '50', isNullable: false, isUnique: true },
                    { name: 'aws_vpc_id', type: 'varchar', length: '50', isNullable: true },
                    { name: 'vpc_id', type: 'uuid', isNullable: true },
                    { name: 'region', type: 'varchar', length: '32', isNullable: true },
                    { name: 'is_default', type: 'boolean', default: false },
                    { name: 'entries', type: 'jsonb', isNullable: true },
                    { name: 'associations', type: 'jsonb', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            }),
        );

        await queryRunner.createForeignKey(
            'aws_network_acls',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            }),
        );

        await queryRunner.createForeignKey(
            'aws_network_acls',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'SET NULL',
            }),
        );

        await queryRunner.createIndex(
            'aws_network_acls',
            new TableIndex({ name: 'idx_aws_network_acls_cloud_account_id', columnNames: ['cloud_account_id'] }),
        );
        await queryRunner.createIndex(
            'aws_network_acls',
            new TableIndex({ name: 'idx_aws_network_acls_vpc_id', columnNames: ['vpc_id'] }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_network_acls');
        await queryRunner.dropTable('aws_waf_ip_sets');
        await queryRunner.dropColumn('aws_waf_web_acls', 'rules');
        await queryRunner.dropColumn('aws_waf_web_acls', 'region');
    }
}
