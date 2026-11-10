import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudIntelligenceFoundation1780900000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ai_chat_messages"
            ADD COLUMN IF NOT EXISTS "agent_type" character varying(64),
            ADD COLUMN IF NOT EXISTS "feedback" smallint
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_usage_records" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "user_id" uuid,
                "agent_type" character varying(64) NOT NULL,
                "provider" character varying(64) NOT NULL,
                "model" character varying(128) NOT NULL,
                "input_tokens" integer NOT NULL DEFAULT 0,
                "output_tokens" integer NOT NULL DEFAULT 0,
                "estimated_cost" numeric(18,8) NOT NULL DEFAULT 0,
                "conversation_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_usage_records_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_usage_records_user"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_usage_records_org_created"
            ON "ai_usage_records" ("organization_id", "created_at" DESC)
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_usage_records_user_created"
            ON "ai_usage_records" ("user_id", "created_at" DESC)
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_usage_records_org_agent_created"
            ON "ai_usage_records" ("organization_id", "agent_type", "created_at" DESC)
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_org_quotas" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL UNIQUE,
                "daily_limit" integer,
                "monthly_limit" integer,
                "per_agent_limits" jsonb NOT NULL DEFAULT '{}',
                "enabled" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_org_quotas_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_recommendations" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "user_id" uuid,
                "agent_type" character varying(64) NOT NULL,
                "category" character varying(100) NOT NULL,
                "title" character varying(300) NOT NULL,
                "description" text NOT NULL,
                "severity" character varying(20) NOT NULL DEFAULT 'medium',
                "priority" character varying(20) NOT NULL DEFAULT 'medium',
                "evidence" jsonb NOT NULL DEFAULT '{}',
                "resource_reference" jsonb,
                "estimated_impact" jsonb,
                "confidence" numeric(5,2) NOT NULL DEFAULT 0,
                "status" character varying(20) NOT NULL DEFAULT 'NEW',
                "dedupe_key" character varying(255) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_recommendations_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ai_recommendations_user"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_recommendations_org_status_created"
            ON "ai_recommendations" ("organization_id", "status", "created_at" DESC)
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_recommendations_org_category"
            ON "ai_recommendations" ("organization_id", "category")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_recommendations_org_dedupe_active"
            ON "ai_recommendations" ("organization_id", "dedupe_key")
            WHERE "status" IN ('NEW', 'REVIEWING', 'APPROVED', 'EXECUTING')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ai_recommendations_org_dedupe_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_recommendations_org_category"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_recommendations_org_status_created"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_recommendations"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_org_quotas"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_usage_records_org_agent_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_usage_records_user_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_usage_records_org_created"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_records"`);
        await queryRunner.query(`
            ALTER TABLE "ai_chat_messages"
            DROP COLUMN IF EXISTS "feedback",
            DROP COLUMN IF EXISTS "agent_type"
        `);
    }
}
