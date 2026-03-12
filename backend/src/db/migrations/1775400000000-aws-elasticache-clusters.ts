import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsElastiCacheClusters1775400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_elasticache_clusters',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'cache_cluster_id', type: 'varchar', length: '255', isNullable: false, isUnique: true },
                    { name: 'cluster_arn', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'cache_cluster_status', type: 'varchar', length: '30', isNullable: true },
                    { name: 'cache_node_type', type: 'varchar', length: '50', isNullable: true },
                    { name: 'engine', type: 'varchar', length: '20', isNullable: true },
                    { name: 'engine_version', type: 'varchar', length: '20', isNullable: true },
                    { name: 'num_cache_nodes', type: 'int', isNullable: true },
                    { name: 'cache_subnet_group_name', type: 'varchar', length: '255', isNullable: true },
                    { name: 'aws_security_group_ids', type: 'jsonb', isNullable: true },
                    { name: 'security_group_ids', type: 'uuid', isArray: true, isNullable: true },
                    { name: 'aws_vpc_id', type: 'varchar', length: '50', isNullable: true },
                    { name: 'vpc_id', type: 'uuid', isNullable: true },
                    { name: 'configuration_endpoint', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'port', type: 'int', isNullable: true },
                    { name: 'multi_az', type: 'boolean', default: false },
                    { name: 'auto_minor_version_upgrade', type: 'boolean', default: false },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_elasticache_clusters', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createForeignKey('aws_elasticache_clusters', new TableForeignKey({
            columnNames: ['vpc_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'aws_vpcs',
            onDelete: 'SET NULL',
        }));

        await queryRunner.createIndex('aws_elasticache_clusters', new TableIndex({ name: 'idx_aws_elasticache_clusters_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_elasticache_clusters', new TableIndex({ name: 'idx_aws_elasticache_clusters_vpc_id', columnNames: ['vpc_id'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_elasticache_clusters');
    }
}
