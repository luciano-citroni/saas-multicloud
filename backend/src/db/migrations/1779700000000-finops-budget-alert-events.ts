import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsBudgetAlertEvents1779700000000 implements MigrationInterface {
    name = 'FinopsBudgetAlertEvents1779700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_budget_alert_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "budget_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "threshold" integer NOT NULL,
                "period_key" character varying(32) NOT NULL,
                "channel" character varying(20) NOT NULL,
                "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_budget_alert_events" PRIMARY KEY ("id"),
                CONSTRAINT "FK_finops_budget_alert_events_budget"
                    FOREIGN KEY ("budget_id") REFERENCES "finops_budgets"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_budget_alert_events_dedupe"
            ON "finops_budget_alert_events" ("budget_id", "threshold", "period_key", "channel")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_finops_budget_alert_events_org"
            ON "finops_budget_alert_events" ("organization_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_budget_alert_events_org"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_budget_alert_events_dedupe"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_budget_alert_events"`);
    }
}
