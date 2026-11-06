import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsCreditsCommitments1780000000000 implements MigrationInterface {
    name = 'FinopsCreditsCommitments1780000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_credit_grants" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "provider" varchar(20) NOT NULL,
                "name" varchar(255) NOT NULL,
                "total_amount" decimal(18,2) NOT NULL,
                "currency" varchar(10) NOT NULL DEFAULT 'USD',
                "starts_at" date NOT NULL,
                "expires_at" date,
                "notes" text,
                "source" varchar(20) NOT NULL DEFAULT 'manual',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_credit_grants" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_credit_grants_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_credit_grants_org_account"
            ON "finops_credit_grants" ("organization_id", "cloud_account_id")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_credit_consumptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "provider" varchar(20) NOT NULL,
                "amount" decimal(18,4) NOT NULL,
                "currency" varchar(10) NOT NULL DEFAULT 'USD',
                "date" date NOT NULL,
                "label" varchar(255) NOT NULL,
                "raw_metadata" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_credit_consumptions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_credit_consumptions_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_credit_consumptions_upsert"
            ON "finops_credit_consumptions" ("cloud_account_id", "date", "label", "currency")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_credit_consumptions_org_date"
            ON "finops_credit_consumptions" ("organization_id", "date")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_commitment_snapshots" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "provider" varchar(20) NOT NULL,
                "commitment_type" varchar(40) NOT NULL,
                "external_id" varchar(512) NOT NULL,
                "name" varchar(512),
                "utilization_percent" decimal(10,4),
                "coverage_percent" decimal(10,4),
                "used_commitment" decimal(18,6),
                "unused_commitment" decimal(18,6),
                "hourly_commitment" decimal(18,6),
                "monthly_commitment" decimal(18,6),
                "term" varchar(64),
                "currency" varchar(10) NOT NULL DEFAULT 'USD',
                "lookback_days" int,
                "raw_metadata" jsonb,
                "synced_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_commitment_snapshots" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_commitment_snapshots_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_commitment_snapshots_external"
            ON "finops_commitment_snapshots" ("cloud_account_id", "commitment_type", "external_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_commitment_snapshots_org"
            ON "finops_commitment_snapshots" ("organization_id", "provider")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_commitment_recommendations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "provider" varchar(20) NOT NULL,
                "commitment_type" varchar(40) NOT NULL,
                "recommendation_key" varchar(255) NOT NULL,
                "lookback_days" int,
                "term" varchar(64),
                "payment_option" varchar(64),
                "estimated_monthly_savings" decimal(18,4),
                "estimated_savings_percentage" decimal(10,4),
                "recommended_hourly_commitment" decimal(18,6),
                "eligible" boolean NOT NULL DEFAULT true,
                "ineligible_reason" text,
                "summary" text,
                "currency" varchar(10) NOT NULL DEFAULT 'USD',
                "raw_metadata" jsonb,
                "synced_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_commitment_recommendations" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_commitment_recommendations_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_commitment_recommendations_key"
            ON "finops_commitment_recommendations" ("cloud_account_id", "commitment_type", "recommendation_key")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_commitment_recommendations_org"
            ON "finops_commitment_recommendations" ("organization_id", "provider")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_commitment_recommendations_org"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_commitment_recommendations_key"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_commitment_recommendations"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_commitment_snapshots_org"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_commitment_snapshots_external"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_commitment_snapshots"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_credit_consumptions_org_date"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_credit_consumptions_upsert"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_credit_consumptions"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_credit_grants_org_account"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_credit_grants"`);
    }
}
