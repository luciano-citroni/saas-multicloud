import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsCommercialReportNotifications1780500000000 implements MigrationInterface {
    name = 'FinopsCommercialReportNotifications1780500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_commercial_report_settings"
            ADD COLUMN IF NOT EXISTS "alert_channels" jsonb NOT NULL DEFAULT '[]'
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_commercial_report_settings"
            ADD COLUMN IF NOT EXISTS "alert_notification_group_ids" jsonb NOT NULL DEFAULT '[]'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_commercial_report_settings"
            DROP COLUMN IF EXISTS "alert_notification_group_ids"
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_commercial_report_settings"
            DROP COLUMN IF EXISTS "alert_channels"
        `);
    }
}
