import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsLoadBalancers1773900000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // =========================================================================
        // 1. Criar tabela aws_load_balancers
        // =========================================================================
        await queryRunner.createTable(
            new Table({
                name: 'aws_load_balancers',
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
                        name: 'aws_load_balancer_arn',
                        type: 'varchar',
                        length: '255',
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
                        name: 'dns_name',
                        type: 'varchar',
                        length: '500',
                        isNullable: false,
                    },
                    {
                        name: 'vpc_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'type',
                        type: 'enum',
                        enum: ['application', 'network', 'gateway', 'classic'],
                        isNullable: false,
                    },
                    {
                        name: 'state',
                        type: 'enum',
                        enum: ['provisioning', 'active', 'active_impaired', 'failed'],
                        isNullable: false,
                    },
                    {
                        name: 'scheme',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'ip_address_type',
                        type: 'enum',
                        enum: ['ipv4', 'dualstack'],
                        isNullable: false,
                    },
                    {
                        name: 'availability_zones',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'security_groups',
                        type: 'jsonb',
                        isNullable: true,
                    },
                    {
                        name: 'created_time',
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

        // Foreign Keys para aws_load_balancers
        await queryRunner.createForeignKey(
            'aws_load_balancers',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_load_balancers',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'SET NULL',
            })
        );

        // Indexes para aws_load_balancers
        await queryRunner.createIndex(
            'aws_load_balancers',
            new TableIndex({
                name: 'idx_aws_load_balancers_cloud_account_id',
                columnNames: ['cloud_account_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_load_balancers',
            new TableIndex({
                name: 'idx_aws_load_balancers_vpc_id',
                columnNames: ['vpc_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_load_balancers',
            new TableIndex({
                name: 'idx_aws_load_balancers_arn',
                columnNames: ['aws_load_balancer_arn'],
            })
        );

        // =========================================================================
        // 2. Criar tabela aws_load_balancer_listeners
        // =========================================================================
        await queryRunner.createTable(
            new Table({
                name: 'aws_load_balancer_listeners',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'load_balancer_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'aws_listener_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: false,
                        isUnique: true,
                    },
                    {
                        name: 'port',
                        type: 'integer',
                        isNullable: false,
                    },
                    {
                        name: 'protocol',
                        type: 'enum',
                        enum: ['HTTP', 'HTTPS', 'TCP', 'TLS', 'UDP', 'TCP_UDP'],
                        isNullable: false,
                    },
                    {
                        name: 'ssl_certificate_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'ssl_policy',
                        type: 'varchar',
                        length: '100',
                        isNullable: true,
                    },
                    {
                        name: 'default_target_group_arn',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'default_actions',
                        type: 'jsonb',
                        isNullable: false,
                    },
                    {
                        name: 'rules',
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

        // Foreign Keys para aws_load_balancer_listeners
        await queryRunner.createForeignKey(
            'aws_load_balancer_listeners',
            new TableForeignKey({
                columnNames: ['load_balancer_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_load_balancers',
                onDelete: 'CASCADE',
            })
        );

        // Indexes para aws_load_balancer_listeners
        await queryRunner.createIndex(
            'aws_load_balancer_listeners',
            new TableIndex({
                name: 'idx_aws_load_balancer_listeners_lb_id',
                columnNames: ['load_balancer_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_load_balancer_listeners',
            new TableIndex({
                name: 'idx_aws_load_balancer_listeners_arn',
                columnNames: ['aws_listener_arn'],
            })
        );

        // =========================================================================
        // 3. Criar tabela aws_load_balancer_subnets
        // =========================================================================
        await queryRunner.createTable(
            new Table({
                name: 'aws_load_balancer_subnets',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        default: 'gen_random_uuid()',
                    },
                    {
                        name: 'load_balancer_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'subnet_id',
                        type: 'uuid',
                        isNullable: false,
                    },
                    {
                        name: 'availability_zone',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'aws_subnet_id',
                        type: 'varchar',
                        length: '50',
                        isNullable: false,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'CURRENT_TIMESTAMP',
                    },
                ],
            })
        );

        // Foreign Keys para aws_load_balancer_subnets
        await queryRunner.createForeignKey(
            'aws_load_balancer_subnets',
            new TableForeignKey({
                columnNames: ['load_balancer_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_load_balancers',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_load_balancer_subnets',
            new TableForeignKey({
                columnNames: ['subnet_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_subnets',
                onDelete: 'CASCADE',
            })
        );

        // Indexes para aws_load_balancer_subnets
        await queryRunner.createIndex(
            'aws_load_balancer_subnets',
            new TableIndex({
                name: 'idx_aws_load_balancer_subnets_lb_id',
                columnNames: ['load_balancer_id'],
            })
        );

        await queryRunner.createIndex(
            'aws_load_balancer_subnets',
            new TableIndex({
                name: 'idx_aws_load_balancer_subnets_subnet_id',
                columnNames: ['subnet_id'],
            })
        );

        // Unique constraint para evitar duplicatas
        await queryRunner.createIndex(
            'aws_load_balancer_subnets',
            new TableIndex({
                name: 'idx_aws_load_balancer_subnets_unique',
                columnNames: ['load_balancer_id', 'subnet_id'],
                isUnique: true,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_load_balancer_subnets');
        await queryRunner.dropTable('aws_load_balancer_listeners');
        await queryRunner.dropTable('aws_load_balancers');
    }
}
