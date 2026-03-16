import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsLambdaFunctions1774800000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_lambda_functions',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'function_arn', type: 'varchar', length: '1024', isNullable: false, isUnique: true },
                    { name: 'function_name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'description', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'runtime', type: 'varchar', length: '50', isNullable: true },
                    { name: 'handler', type: 'varchar', length: '255', isNullable: true },
                    { name: 'role_arn', type: 'varchar', length: '2048', isNullable: true },
                    { name: 'iam_role_id', type: 'uuid', isNullable: true },
                    { name: 'code_size', type: 'bigint', isNullable: true },
                    { name: 'memory_size', type: 'int', isNullable: true },
                    { name: 'timeout', type: 'int', isNullable: true },
                    { name: 'state', type: 'varchar', length: '30', isNullable: true },
                    { name: 'architectures', type: 'varchar', length: '20', isNullable: true },
                    { name: 'version', type: 'varchar', length: '50', isNullable: true },
                    { name: 'aws_vpc_id', type: 'varchar', length: '50', isNullable: true },
                    { name: 'vpc_id', type: 'uuid', isNullable: true },
                    { name: 'aws_subnet_ids', type: 'jsonb', isNullable: true },
                    { name: 'subnet_ids', type: 'uuid', isArray: true, isNullable: true },
                    { name: 'aws_security_group_ids', type: 'jsonb', isNullable: true },
                    { name: 'security_group_ids', type: 'uuid', isArray: true, isNullable: true },
                    { name: 'environment_variables_keys', type: 'jsonb', isNullable: true },
                    { name: 'last_modified_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_lambda_functions',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_lambda_functions',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createForeignKey(
            'aws_lambda_functions',
            new TableForeignKey({
                columnNames: ['iam_role_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_iam_roles',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'aws_lambda_functions',
            new TableIndex({ name: 'idx_aws_lambda_functions_cloud_account_id', columnNames: ['cloud_account_id'] })
        );
        await queryRunner.createIndex(
            'aws_lambda_functions',
            new TableIndex({ name: 'idx_aws_lambda_functions_function_name', columnNames: ['function_name'] })
        );
        await queryRunner.createIndex('aws_lambda_functions', new TableIndex({ name: 'idx_aws_lambda_functions_vpc_id', columnNames: ['vpc_id'] }));
        await queryRunner.createIndex(
            'aws_lambda_functions',
            new TableIndex({ name: 'idx_aws_lambda_functions_iam_role_id', columnNames: ['iam_role_id'] })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_lambda_functions');
    }
}
