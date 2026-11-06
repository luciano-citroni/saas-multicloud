import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsCommercialReport1780400000000 implements MigrationInterface {
    name = 'FinopsCommercialReport1780400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_exchange_rates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "month" date NOT NULL,
                "brl_per_usd" numeric(12,6) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_exchange_rates" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_exchange_rates_org_month"
            ON "finops_exchange_rates" ("organization_id", "month")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_commercial_report_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "enabled" boolean NOT NULL DEFAULT false,
                "emails" jsonb NOT NULL DEFAULT '[]',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_commercial_report_settings" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_commercial_report_settings_org"
            ON "finops_commercial_report_settings" ("organization_id")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_commercial_report_sends" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "month" varchar(7) NOT NULL,
                "sent_at" TIMESTAMPTZ NOT NULL,
                "recipient_count" int NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_commercial_report_sends" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_commercial_report_sends_org_month"
            ON "finops_commercial_report_sends" ("organization_id", "month")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_commercial_report_sends_org_month"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_commercial_report_sends"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_commercial_report_settings_org"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_commercial_report_settings"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_exchange_rates_org_month"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_exchange_rates"`);
    }
}
