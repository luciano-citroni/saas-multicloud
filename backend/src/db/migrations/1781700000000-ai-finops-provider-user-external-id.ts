import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiFinopsProviderUserExternalId1781700000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ai_finops_usage_records"
            ADD COLUMN IF NOT EXISTS "provider_user_external_id" character varying(255)
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_finops_usage_daily"
            ADD COLUMN IF NOT EXISTS "provider_user_external_id" character varying(255)
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_finops_usage_provider_user"
            ON "ai_finops_usage_records" ("provider_user_external_id", "occurred_at")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_finops_usage_daily_provider_user"
            ON "ai_finops_usage_daily" ("provider_user_external_id", "usage_date")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_finops_usage_daily_provider_user"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_finops_usage_provider_user"`);
        await queryRunner.query(`
            ALTER TABLE "ai_finops_usage_daily" DROP COLUMN IF EXISTS "provider_user_external_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_finops_usage_records" DROP COLUMN IF EXISTS "provider_user_external_id"
        `);
    }
}
