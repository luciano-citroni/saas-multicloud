import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsCreditGrantAwsImport1780200000000 implements MigrationInterface {
    name = 'FinopsCreditGrantAwsImport1780200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "finops_credit_grants"
            ADD COLUMN IF NOT EXISTS "applies_to_all_services" boolean NOT NULL DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_credit_grants"
            ADD COLUMN IF NOT EXISTS "external_id" varchar(128)
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_credit_grants"
            ADD COLUMN IF NOT EXISTS "reported_remaining" decimal(18,2)
        `);
        await queryRunner.query(`
            ALTER TABLE "finops_credit_grants"
            ADD COLUMN IF NOT EXISTS "provider_usage" jsonb
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_credit_grants_account_external"
            ON "finops_credit_grants" ("cloud_account_id", "external_id")
            WHERE "external_id" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_credit_grants_account_external"`);
        await queryRunner.query(`ALTER TABLE "finops_credit_grants" DROP COLUMN IF EXISTS "provider_usage"`);
        await queryRunner.query(`ALTER TABLE "finops_credit_grants" DROP COLUMN IF EXISTS "reported_remaining"`);
        await queryRunner.query(`ALTER TABLE "finops_credit_grants" DROP COLUMN IF EXISTS "external_id"`);
        await queryRunner.query(`ALTER TABLE "finops_credit_grants" DROP COLUMN IF EXISTS "applies_to_all_services"`);
    }
}
