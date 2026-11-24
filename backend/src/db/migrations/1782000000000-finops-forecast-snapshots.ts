import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsForecastSnapshots1782000000000 implements MigrationInterface {
    name = 'FinopsForecastSnapshots1782000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_forecast_snapshots" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "cloud_account_id" uuid NOT NULL,
                "provider" varchar(20) NOT NULL,
                "horizon" varchar(20) NOT NULL,
                "month" varchar(7) NOT NULL,
                "forecasted_cost" decimal(18,6) NOT NULL,
                "avg_daily_cost" decimal(18,6),
                "currency" varchar(10) NOT NULL DEFAULT 'USD',
                "source" varchar(20) NOT NULL,
                "confidence" varchar(10),
                "days_elapsed" int,
                "days_remaining" int,
                "period_start" date,
                "period_end" date,
                "by_service" jsonb,
                "synced_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_forecast_snapshots" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_forecast_snapshots_cloud_account"
                    FOREIGN KEY ("cloud_account_id") REFERENCES "cloud_accounts"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_forecast_snapshots"
            ON "finops_forecast_snapshots" ("cloud_account_id", "horizon", "month")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_forecast_snapshots_org"
            ON "finops_forecast_snapshots" ("organization_id", "cloud_account_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_forecast_snapshots_org"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_forecast_snapshots"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_forecast_snapshots"`);
    }
}
