import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAwsCloudWatchAlarms1774600000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'aws_cloudwatch_alarms',
                columns: [
                    { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
                    { name: 'cloud_account_id', type: 'uuid', isNullable: false },
                    { name: 'alarm_arn', type: 'varchar', length: '1024', isNullable: false, isUnique: true },
                    { name: 'alarm_name', type: 'varchar', length: '255', isNullable: false },
                    { name: 'alarm_description', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'state_value', type: 'varchar', length: '30', isNullable: false },
                    { name: 'state_reason', type: 'varchar', length: '1024', isNullable: true },
                    { name: 'namespace', type: 'varchar', length: '255', isNullable: true },
                    { name: 'metric_name', type: 'varchar', length: '255', isNullable: true },
                    { name: 'comparison_operator', type: 'varchar', length: '64', isNullable: true },
                    { name: 'threshold', type: 'float', isNullable: true },
                    { name: 'period', type: 'int', isNullable: true },
                    { name: 'evaluation_periods', type: 'int', isNullable: true },
                    { name: 'statistic', type: 'varchar', length: '30', isNullable: true },
                    { name: 'alarm_actions', type: 'jsonb', isNullable: true },
                    { name: 'dimensions', type: 'jsonb', isNullable: true },
                    { name: 'last_synced_at', type: 'timestamptz', isNullable: true },
                    { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                    { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
                ],
            })
        );

        await queryRunner.createForeignKey('aws_cloudwatch_alarms', new TableForeignKey({
            columnNames: ['cloud_account_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'cloud_accounts',
            onDelete: 'CASCADE',
        }));

        await queryRunner.createIndex('aws_cloudwatch_alarms', new TableIndex({ name: 'idx_aws_cloudwatch_alarms_cloud_account_id', columnNames: ['cloud_account_id'] }));
        await queryRunner.createIndex('aws_cloudwatch_alarms', new TableIndex({ name: 'idx_aws_cloudwatch_alarms_alarm_name', columnNames: ['alarm_name'] }));
        await queryRunner.createIndex('aws_cloudwatch_alarms', new TableIndex({ name: 'idx_aws_cloudwatch_alarms_state_value', columnNames: ['state_value'] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('aws_cloudwatch_alarms');
    }
}
