import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsCloudTrailTrails1774700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_cloudtrail_trails',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'trail_arn', type: 'varchar', length: '1024', isNullable: false, isUnique: true },
                    { name: 'name', type: 'varchar', length: '255', isNullable: false },
                    { name: 's3_bucket_name', type: 'varchar', length: '1024', isNullable: true },
                    { name: 's3_key_prefix', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'is_multi_region_trail', type: 'boolean', default: false },
                    { name: 'is_logging', type: 'boolean', default: false },
                    { name: 'home_region', type: 'varchar', length: '50', isNullable: true },
                    { name: 'is_organization_trail', type: 'boolean', default: false },
                    { name: 'log_file_validation_enabled', type: 'boolean', default: false },
                    { name: 'sns_topic_arn', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'cloud_watch_logs_log_group_arn', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'aws_vpc_id', type: 'varchar', length: '50', isNullable: true },
                    { name: 'vpc_id', type: 'uuid', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_cloudtrail_trails', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createForeignKey('aws_cloudtrail_trails', new TableForeignKey({
            columnNames: ['vpc_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'aws_vpcs',
            onDelete: 'SET NULL',
        }));

        await queryRunner.createIndex('aws_cloudtrail_trails', new TableIndex({ name: 'idx_aws_cloudtrail_trails_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_cloudtrail_trails', new TableIndex({ name: 'idx_aws_cloudtrail_trails_vpc_id', columnNames: ['vpc_id'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_cloudtrail_trails');
    }
}
