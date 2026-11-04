import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsResourceChangeEvents1779800000000 implements MigrationInterface {
    name = 'FinopsResourceChangeEvents1779800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_resource_change_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "cloud_provider" varchar(20) NOT NULL,
                "resource_type" varchar(40) NOT NULL,
                "resource_id" varchar(512) NOT NULL,
                "field" varchar(64) NOT NULL,
                "previous_value" text NOT NULL,
                "new_value" text NOT NULL,
                "detected_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "pk_finops_resource_change_events" PRIMARY KEY ("id"),
                CONSTRAINT "fk_finops_resource_change_events_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_finops_resource_change_org_account_detected"
                ON "finops_resource_change_events" ("organization_id", "cloud_account_id", "detected_at")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_finops_resource_change_account_resource_detected"
                ON "finops_resource_change_events" ("cloud_account_id", "resource_id", "detected_at")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_finops_cost_records_account_service_resource_date"
                ON "finops_cost_records" ("organization_id", "cloud_account_id", "service", "resource_id", "date")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_finops_cost_records_account_service_resource_date"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_finops_resource_change_account_resource_detected"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_finops_resource_change_org_account_detected"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_resource_change_events"`);
    }
}
