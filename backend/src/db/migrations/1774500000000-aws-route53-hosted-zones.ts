import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsRoute53HostedZones1774500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_route53_hosted_zones',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'aws_hosted_zone_id', type: 'varchar', length: '255', isNullable: false, isUnique: true },
                    { name: 'name', type: 'varchar', length: '1024', isNullable: false },
                    { name: 'zone_type', type: 'varchar', length: '10', isNullable: false },
                    { name: 'record_set_count', type: 'int', isNullable: true },
                    { name: 'comment', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'aws_vpc_id', type: 'varchar', length: '50', isNullable: true },
                    { name: 'vpc_id', type: 'uuid', isNullable: true },
                    { name: 'is_private', type: 'boolean', default: false },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey(
            'aws_route53_hosted_zones',
            new TableForeignKey({
                columnNames: ['cloud_account_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'cloud_accounts',
                onDelete: 'CASCADE',
            })
        );

        await queryRunner.createForeignKey(
            'aws_route53_hosted_zones',
            new TableForeignKey({
                columnNames: ['vpc_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'aws_vpcs',
                onDelete: 'SET NULL',
            })
        );

        await queryRunner.createIndex(
            'aws_route53_hosted_zones',
            new TableIndex({ name: 'idx_aws_route53_hosted_zones_cloud_account_id', columnNames: ['cloud_account_id'] })
        );
        await queryRunner.createIndex(
            'aws_route53_hosted_zones',
            new TableIndex({ name: 'idx_aws_route53_hosted_zones_vpc_id', columnNames: ['vpc_id'] })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_route53_hosted_zones');
    }
}
