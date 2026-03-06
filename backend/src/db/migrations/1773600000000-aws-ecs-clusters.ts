import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsEcsClusters1773600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_ecs_clusters',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'cloud_account_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'cluster_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'cluster_name',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'registered_container_instances_count',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'running_tasks_count',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'pending_tasks_count',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'active_services_count',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'tags',
                        type: 'jsonb',
                        default: "'{}'",
                    },
                    {
                        name: 'capacity_providers',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'default_capacity_provider_strategy',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'last_synced_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamptz',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamptz',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_ecs_clusters',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_clusters',
            new TableIndex({
                name: 'idx_aws_ecs_clusters_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_clusters',
            new TableIndex({
                name: 'idx_aws_ecs_clusters_cluster_name',
                columnNames: ['cluster_name'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_ecs_clusters');
    }
}
