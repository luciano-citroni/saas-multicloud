import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AwsIamRoles1774000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_iam_roles',
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
                        name: 'aws_role_id',
                        type: 'varchar',
                        length: '128',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'role_arn',
                        type: 'varchar',
                        length: '2048',
                        isNullable: false,
                    },
                    {
                        name: 'role_name',
                        type: 'varchar',
                        length: '128',
                        isNullable: false,
                    },
                    {
                        name: 'path',
                        type: 'varchar',
                        length: '512',
                        isNullable: false,
                        default: "'/'",
                    },
                    {
                        name: 'description',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'assume_role_policy_document',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'max_session_duration',
                        type: 'int',
                        isNullable: false,
                        default: 3600,
                    },
                    {
                        name: 'permissions_boundary_arn',
                        type: 'varchar',
                        length: '2048',
                        isNullable: true,
                    },
                    {
                        name: 'attached_policies',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'inline_policy_names',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'role_last_used',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'created_date_aws',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'tags',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'last_synced_at',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_iam_roles',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_iam_roles',
            new TableIndex({
                name: 'idx_aws_iam_roles_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_iam_roles',
            new TableIndex({
                name: 'idx_aws_iam_roles_aws_role_id',
                columnNames: ['aws_role_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_iam_roles',
            new TableIndex({
                name: 'idx_aws_iam_roles_path',
                columnNames: ['path'],
            })
        );

        await queryRunner.createIndex(
            'aws_iam_roles',
            new TableIndex({
                name: 'idx_aws_iam_roles_role_name',
                columnNames: ['role_name'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_iam_roles');
    }
}
