import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsGuardDutyDetectors1775800000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_guardduty_detectors',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'detector_id', type: 'varchar', length: '255', isNullable: false, isUnique: true },
                    { name: 'status', type: 'varchar', length: '20', isNullable: true },
                    { name: 'finding_publishing_frequency', type: 'varchar', length: '30', isNullable: true },
                    { name: 'service_role', type: 'varchar', length: '2048', isNullable: true },
                    { name: 'findings_count', type: 'int', isNullable: true },
                    { name: 'data_sources', type: 'jsonb', isNullable: true },
                    { name: 'features', type: 'jsonb', isNullable: true },
                    { name: 'created_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'updated_at_aws', type: 'timestamptz', isNullable: true },
                    { name: 'tags', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_guardduty_detectors', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createIndex('aws_guardduty_detectors', new TableIndex({ name: 'idx_aws_guardduty_detectors_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_guardduty_detectors', new TableIndex({ name: 'idx_aws_guardduty_detectors_status', columnNames: ['status'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_guardduty_detectors');
    }
}
