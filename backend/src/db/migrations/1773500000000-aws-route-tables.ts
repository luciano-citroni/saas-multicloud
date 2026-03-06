import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsRouteTables1773500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_route_tables',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'vpc_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'aws_route_table_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'aws_vpc_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'is_main',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'routes',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'associations',
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
            'aws_route_tables',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_route_tables',
            new TableIndex({
                name: 'idx_aws_route_tables_vpc_id',
                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_route_tables',
            new TableIndex({
                name: 'idx_aws_route_tables_aws_route_table_id',
                columnNames: ['aws_route_table_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_route_tables',
            new TableIndex({
                name: 'idx_aws_route_tables_aws_vpc_id',
                columnNames: ['aws_vpc_id'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_route_tables');
    }
}
