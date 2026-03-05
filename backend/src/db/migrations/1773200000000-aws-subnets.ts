import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsSubnets1773200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_subnets',
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
                        name: 'aws_subnet_id',
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
                        name: 'cidr_block',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'availability_zone',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'available_ip_address_count',
                        type: 'integer',
                        default: 0,
                    },
                    {
                        name: 'state',
                        type: 'varchar',
                        length: '20',
                        isNullable: false,
                    },
                    {
                        name: 'is_default_for_az',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'map_public_ip_on_launch',
                        type: 'boolean',
                        default: false,
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
            'aws_subnets',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_subnets',
            new TableIndex({
                name: 'idx_aws_subnets_vpc_id',
                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_subnets',
            new TableIndex({
                name: 'idx_aws_subnets_aws_subnet_id',
                columnNames: ['aws_subnet_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_subnets',
            new TableIndex({
                name: 'idx_aws_subnets_aws_vpc_id',
                columnNames: ['aws_vpc_id'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_subnets');
    }
}
