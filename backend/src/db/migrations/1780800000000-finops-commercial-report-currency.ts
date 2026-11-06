import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsCommercialReportCurrency1780800000000 implements MigrationInterface {
    name = 'FinopsCommercialReportCurrency1780800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_commercial_report_settings"
            ADD COLUMN IF NOT EXISTS "currency" character varying(3) NOT NULL DEFAULT 'BRL'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_commercial_report_settings"
            DROP COLUMN IF EXISTS "currency"
        `);
    }
}
