import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsBudgetNotificationGroups1779600000000 implements MigrationInterface {
    name = 'FinopsBudgetNotificationGroups1779600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_budgets"
            ADD COLUMN IF NOT EXISTS "alert_notification_group_ids" jsonb NOT NULL DEFAULT '[]';
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_budgets"
            DROP COLUMN IF EXISTS "alert_notification_group_ids";
        `);
    }
}
