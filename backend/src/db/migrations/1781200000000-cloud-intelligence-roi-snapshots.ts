import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudIntelligenceRoiSnapshots1781200000000 implements MigrationInterface {
    name = 'CloudIntelligenceRoiSnapshots1781200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_roi_snapshots" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "period_start" date NOT NULL,
                "period_end" date NOT NULL,
                "potential_saving" numeric(14,2) NOT NULL DEFAULT 0,
                "completed_saving" numeric(14,2) NOT NULL DEFAULT 0,
                "completed_count" integer NOT NULL DEFAULT 0,
                "pending_count" integer NOT NULL DEFAULT 0,
                "currency" varchar(8) NOT NULL DEFAULT 'USD',
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_roi_snapshots_org"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_roi_snapshots_org_period"
            ON "ai_roi_snapshots" ("organization_id", "period_start", "period_end")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ai_roi_snapshots_org_period"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_roi_snapshots"`);
    }
}
