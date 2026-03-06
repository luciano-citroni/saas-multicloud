import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSubnetType1773400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'aws_subnets',
            new TableColumn({
                name: 'subnet_type',
                type: 'varchar',
                length: '20',
                default: "'private_isolated'",
                isNullable: false,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('aws_subnets', 'subnet_type');
    }
}
