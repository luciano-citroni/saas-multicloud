import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinopsAnomalyAlertSettings1779900000000 implements MigrationInterface {
    name = 'FinopsAnomalyAlertSettings1779900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_anomaly_alert_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "enabled" boolean NOT NULL DEFAULT false,
                "alert_channels" jsonb NOT NULL DEFAULT '[]',
                "alert_notification_group_ids" jsonb NOT NULL DEFAULT '[]',
                "min_severity" varchar(20) NOT NULL DEFAULT 'high',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_anomaly_alert_settings" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finops_anomaly_alert_settings_org"
            ON "finops_anomaly_alert_settings" ("organization_id")
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "finops_anomaly_alert_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "period_key" varchar(32) NOT NULL,
                "channel" varchar(20) NOT NULL,
                "anomaly_count" int NOT NULL DEFAULT 0,
                "sent_at" TIMESTAMPTZ NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_finops_anomaly_alert_events" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_finops_anomaly_alert_events_dedupe"
            ON "finops_anomaly_alert_events" ("organization_id", "period_key", "channel")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_finops_anomaly_alert_events_dedupe"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_anomaly_alert_events"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_finops_anomaly_alert_settings_org"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "finops_anomaly_alert_settings"`);
    }
}
