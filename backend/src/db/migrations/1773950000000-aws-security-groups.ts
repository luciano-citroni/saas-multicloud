import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AwsSecurityGroups1773950000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // =========================================================================

        // 1. Criar tabela aws_security_groups

        // =========================================================================

        await queryRunner.createTable(
            new Table({
                name: 'aws_security_groups',

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
                        name: 'aws_security_group_id',

                        type: 'varchar',

                        length: '50',

                        isNullable: false,

                        isUnique: true,
                    },

                    {
                        name: 'name',

                        type: 'varchar',

                        length: '255',

                        isNullable: false,
                    },

                    {
                        name: 'description',

                        type: 'text',

                        isNullable: false,
                    },

                    {
                        name: 'aws_vpc_id',

                        type: 'varchar',

                        length: '50',

                        isNullable: true,
                    },

                    {
                        name: 'vpc_id',

                        type: 'uuid',

                        isNullable: true,
                    },

                    {
                        name: 'owner_id',

                        type: 'varchar',

                        length: '50',

                        isNullable: false,
                    },

                    {
                        name: 'inbound_rules',

                        type: 'jsonb',

                        isNullable: true,
                    },

                    {
                        name: 'outbound_rules',

                        type: 'jsonb',

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
            'aws_security_groups',

            new TableForeignKey({
                columnNames: ['cloud_account_id'],

                referencedColumnNames: ['id'],

                referencedTableName: 'cloud_accounts',

                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_security_groups',

            new TableForeignKey({
                columnNames: ['vpc_id'],

                referencedColumnNames: ['id'],

                referencedTableName: 'aws_vpcs',

                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'aws_security_groups',

            new TableIndex({
                name: 'idx_aws_security_groups_cloud_account_id',

                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_security_groups',

            new TableIndex({
                name: 'idx_aws_security_groups_vpc_id',

                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_security_groups',

            new TableIndex({
                name: 'idx_aws_security_groups_aws_sg_id',

                columnNames: ['aws_security_group_id'],
            })
        );

        // =========================================================================

        // 2. Alterar aws_ec2_instances:

        //    - renomear security_group_id (varchar) → aws_security_group_id

        //    - adicionar security_group_id (uuid, FK → aws_security_groups)

        // =========================================================================

        await queryRunner.renameColumn('aws_ec2_instances', 'security_group_id', 'aws_security_group_id');

        await queryRunner.addColumn(
            'aws_ec2_instances',

            new TableColumn({
                name: 'security_group_id',

                type: 'uuid',

                isNullable: true,
            })
        );

        await queryRunner.createForeignKey(
            'aws_ec2_instances',

            new TableForeignKey({
                columnNames: ['security_group_id'],

                referencedColumnNames: ['id'],

                referencedTableName: 'aws_security_groups',

                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'aws_ec2_instances',

            new TableIndex({
                name: 'idx_aws_ec2_security_group_id',

                columnNames: ['security_group_id'],
            })
        );

        // =========================================================================

        // 3. Alterar aws_load_balancers:

        //    - renomear security_groups (jsonb) → aws_security_group_ids

        //    - adicionar security_group_ids (uuid[])

        // =========================================================================

        await queryRunner.renameColumn('aws_load_balancers', 'security_groups', 'aws_security_group_ids');

        await queryRunner.addColumn(
            'aws_load_balancers',

            new TableColumn({
                name: 'security_group_ids',

                type: 'uuid',

                isArray: true,

                isNullable: true,
            })
        );

        // =========================================================================

        // 4. Alterar aws_ecs_services:

        //    - adicionar security_group_ids (uuid[])

        // =========================================================================

        await queryRunner.addColumn(
            'aws_ecs_services',

            new TableColumn({
                name: 'security_group_ids',

                type: 'uuid',

                isArray: true,

                isNullable: true,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverter aws_ecs_services

        await queryRunner.dropColumn('aws_ecs_services', 'security_group_ids');

        // Reverter aws_load_balancers

        await queryRunner.dropColumn('aws_load_balancers', 'security_group_ids');

        await queryRunner.renameColumn('aws_load_balancers', 'aws_security_group_ids', 'security_groups');

        // Reverter aws_ec2_instances

        await queryRunner.dropColumn('aws_ec2_instances', 'security_group_id');

        await queryRunner.renameColumn('aws_ec2_instances', 'aws_security_group_id', 'security_group_id');

        // Dropar tabela aws_security_groups

        await queryRunner.dropTable('aws_security_groups');
    }
}
