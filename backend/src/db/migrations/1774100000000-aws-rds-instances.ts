import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsRdsInstances1774100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_rds_instances',
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
                        name: 'vpc_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'subnet_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'security_group_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'iam_role_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'aws_db_instance_identifier',
                        type: 'varchar',
                        length: '128',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'db_instance_arn',
                        type: 'varchar',
                        length: '512',
                        isNullable: true,
                    },
                    {
                        name: 'aws_vpc_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'aws_subnet_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'aws_security_group_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'role_arn',
                        type: 'varchar',
                        length: '2048',
                        isNullable: true,
                    },
                    {
                        name: 'db_instance_class',
                        type: 'varchar',
                        length: '80',
                        isNullable: false,
                    },
                    {
                        name: 'engine',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'engine_version',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'status',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'endpoint_address',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'endpoint_port',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'availability_zone',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'multi_az',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'publicly_accessible',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'storage_type',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'allocated_storage',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'backup_retention_period',
                        type: 'int',
                        isNullable: true,
                    },
                    {
                        name: 'iam_database_authentication_enabled',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'deletion_protection',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'storage_encrypted',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'kms_key_id',
                        type: 'varchar',
                        length: '2048',
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
            'aws_rds_instances',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_rds_instances',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createForeignKey(
            'aws_rds_instances',
            new TableForeignKey({
                columnNames: ['subnet_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_subnets',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createForeignKey(
            'aws_rds_instances',
            new TableForeignKey({
                columnNames: ['security_group_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_security_groups',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createForeignKey(
            'aws_rds_instances',
            new TableForeignKey({
                columnNames: ['iam_role_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_iam_roles',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_vpc_id',
                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_subnet_id',
                columnNames: ['subnet_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_security_group_id',
                columnNames: ['security_group_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_iam_role_id',
                columnNames: ['iam_role_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_identifier',
                columnNames: ['aws_db_instance_identifier'],
            })
        );

        await queryRunner.createIndex(
            'aws_rds_instances',
            new TableIndex({
                name: 'idx_aws_rds_instances_status',
                columnNames: ['status'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_rds_instances');
    }
}
