import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsEcsServices1773800000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_ecs_services',
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
                        name: 'cluster_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'task_definition_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'service_arn',
                        type: 'varchar',
                        length: '512',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'service_name',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'cluster_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'task_definition_arn',
                        type: 'varchar',
                        length: '512',
                        isNullable: false,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'desired_count',
                        type: 'int',
                        isNullable: false,
                    },
                    {
                        name: 'running_count',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'pending_count',
                        type: 'int',
                        default: 0,
                    },
                    {
                        name: 'launch_type',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'capacity_provider_strategy',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'platform_version',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'platform_family',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'role_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'deployment_configuration',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'deployments',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'network_configuration',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'load_balancers',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'service_registries',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'scheduling_strategy',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'enable_circuit_breaker',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'enable_ecs_managed_tags',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'tags',
                        type: 'jsonb',
                        default: "'{}'",
                    },
                    {
                        name: 'created_at_aws',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'created_by',
                        type: 'varchar',
                        length: '255',
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
            'aws_ecs_services',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_ecs_services',
            new TableForeignKey({
                columnNames: ['cluster_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_ecs_clusters',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_ecs_services',
            new TableForeignKey({
                columnNames: ['task_definition_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_ecs_task_definitions',
                onDelete: 'RESTRICT',
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_services',
            new TableIndex({
                name: 'idx_aws_ecs_services_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_services',
            new TableIndex({
                name: 'idx_aws_ecs_services_cluster_id',
                columnNames: ['cluster_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_services',
            new TableIndex({
                name: 'idx_aws_ecs_services_task_definition_id',
                columnNames: ['task_definition_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_services',
            new TableIndex({
                name: 'idx_aws_ecs_services_service_name',
                columnNames: ['service_name'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_ecs_services');
    }
}
