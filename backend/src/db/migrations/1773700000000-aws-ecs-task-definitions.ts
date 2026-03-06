import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsEcsTaskDefinitions1773700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_ecs_task_definitions',
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
                        name: 'task_definition_arn',
                        type: 'varchar',
                        length: '512',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'family',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                    },
                    {
                        name: 'revision',
                        type: 'int',
                        isNullable: false,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'execution_role_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'task_role_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'network_mode',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'cpu',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'memory',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'requires_compatibilities',
                        type: 'jsonb',
                        isNullable: false,
                    },
                    {
                        name: 'container_definitions',
                        type: 'jsonb',
                        isNullable: false,
                    },
                    {
                        name: 'volumes',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'placement_constraints',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'runtime_platform',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'ephemeral_storage',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'tags',
                        type: 'jsonb',
                        default: "'{}'",
                    },
                    {
                        name: 'registered_at',
                        type: 'timestamptz',
                        isNullable: true,
                    },
                    {
                        name: 'registered_by',
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
            'aws_ecs_task_definitions',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_task_definitions',
            new TableIndex({
                name: 'idx_aws_ecs_task_definitions_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_task_definitions',
            new TableIndex({
                name: 'idx_aws_ecs_task_definitions_family',
                columnNames: ['family'],
            })
        );

        await queryRunner.createIndex(
            'aws_ecs_task_definitions',
            new TableIndex({
                name: 'idx_aws_ecs_task_definitions_family_revision',
                columnNames: ['family', 'revision'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_ecs_task_definitions');
    }
}
