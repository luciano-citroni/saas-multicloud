import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsEc2Instances1773300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_ec2_instances',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'subnet_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'vpc_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'aws_instance_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'aws_subnet_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'aws_vpc_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'instance_type',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'state',
                        type: 'varchar',
                        length: '20',
                        isNullable: false,
                    },
                    {
                        name: 'state_reason',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'image_id',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'private_ip_address',
                        type: 'varchar',
                        length: '15',
                        isNullable: true,
                    },
                    {
                        name: 'public_ip_address',
                        type: 'varchar',
                        length: '15',
                        isNullable: true,
                    },
                    {
                        name: 'elastic_ip',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'key_name',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'security_group_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'availability_zone',
                        type: 'varchar',
                        length: '50',
                        isNullable: true,
                    },
                    {
                        name: 'launch_time',
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
            'aws_ec2_instances',
            new TableForeignKey({
                columnNames: ['subnet_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_subnets',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_ec2_instances',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createIndex(
            'aws_ec2_instances',
            new TableIndex({
                name: 'idx_aws_ec2_subnet_id',
                columnNames: ['subnet_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ec2_instances',
            new TableIndex({
                name: 'idx_aws_ec2_vpc_id',
                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ec2_instances',
            new TableIndex({
                name: 'idx_aws_ec2_aws_instance_id',
                columnNames: ['aws_instance_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_ec2_instances',
            new TableIndex({
                name: 'idx_aws_ec2_state',
                columnNames: ['state'],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_ec2_instances');
    }
}
