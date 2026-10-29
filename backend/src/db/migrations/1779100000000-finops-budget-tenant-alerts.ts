import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsBudgetTenantAlerts1779100000000 implements MigrationInterface {
    name = 'FinopsBudgetTenantAlerts1779100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_budgets"
                ALTER COLUMN "cloud_account_id" DROP NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "finops_budgets"
                ADD COLUMN "scope" varchar(20) NOT NULL DEFAULT 'cloud_account',
                ADD COLUMN "resource_id" varchar(512) NULL,
                ADD COLUMN "alert_frequency" varchar(20) NOT NULL DEFAULT 'monthly',
                ADD COLUMN "alert_type" varchar(20) NOT NULL DEFAULT 'percentage',
                ADD COLUMN "alert_amount" decimal(18,2) NULL,
                ADD COLUMN "alert_channels" jsonb NOT NULL DEFAULT '["email"]',
                ADD COLUMN "alert_emails" jsonb NOT NULL DEFAULT '[]'
        `);

        await queryRunner.query(`
            UPDATE "finops_budgets"
            SET "scope" = CASE
                WHEN "cloud_account_id" IS NULL THEN 'organization'
                ELSE 'cloud_account'
            END
        `);

        await queryRunner.query(`
            CREATE INDEX "idx_finops_budgets_org_scope"
                ON "finops_budgets" ("organization_id", "scope")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_finops_budgets_org_scope"`);

        await queryRunner.query(`
            DELETE FROM "finops_budgets" WHERE "cloud_account_id" IS NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "finops_budgets"
                DROP COLUMN IF EXISTS "alert_emails",
                DROP COLUMN IF EXISTS "alert_channels",
                DROP COLUMN IF EXISTS "alert_amount",
                DROP COLUMN IF EXISTS "alert_type",
                DROP COLUMN IF EXISTS "alert_frequency",
                DROP COLUMN IF EXISTS "resource_id",
                DROP COLUMN IF EXISTS "scope"
        `);

        await queryRunner.query(`
            ALTER TABLE "finops_budgets"
                ALTER COLUMN "cloud_account_id" SET NOT NULL
        `);
    }
}
