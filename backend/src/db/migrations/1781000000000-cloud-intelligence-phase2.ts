import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudIntelligencePhase21781000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ai_org_quotas"
            ADD COLUMN IF NOT EXISTS "tier" character varying(32),
            ADD COLUMN IF NOT EXISTS "daily_intelligence_enabled" boolean NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS "notification_group_ids" jsonb NOT NULL DEFAULT '[]'
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_daily_reports" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid NOT NULL,
                "report_date" date NOT NULL,
                "summary" text NOT NULL,
                "findings" jsonb NOT NULL DEFAULT '{}',
                "recommendation_ids" jsonb NOT NULL DEFAULT '[]',
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_daily_reports_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_daily_reports_org_date"
            ON "ai_daily_reports" ("organization_id", "report_date")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_daily_reports_org_created"
            ON "ai_daily_reports" ("organization_id", "created_at" DESC)
        `);

        // CREATE EXTENSION failure aborts the whole migration transaction on Postgres.
        // Probe availability first, then create only when the control file is present.
        const available = (await queryRunner.query(
            `SELECT 1 AS ok FROM pg_available_extensions WHERE name = 'vector' LIMIT 1`,
        )) as Array<{ ok: number }>;
        let hasPgvector = available.length > 0;
        if (hasPgvector) {
            try {
                await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
            } catch {
                hasPgvector = false;
            }
        }

        const embeddingColumn = hasPgvector ? `"embedding" vector(1536)` : `"embedding" jsonb`;

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "ai_knowledge_chunks" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "organization_id" uuid,
                "source" character varying(100) NOT NULL,
                "title" character varying(300) NOT NULL,
                "content" text NOT NULL,
                "content_hash" character varying(64) NOT NULL,
                ${embeddingColumn},
                "metadata" jsonb NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_ai_knowledge_chunks_organization"
                    FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_knowledge_chunks_org_source"
            ON "ai_knowledge_chunks" ("organization_id", "source")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_knowledge_chunks_scope_hash"
            ON "ai_knowledge_chunks" (COALESCE("organization_id", '00000000-0000-0000-0000-000000000000'::uuid), "content_hash")
        `);

        if (hasPgvector) {
            try {
                await queryRunner.query(`
                    CREATE INDEX IF NOT EXISTS "IDX_ai_knowledge_chunks_embedding_hnsw"
                    ON "ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops)
                `);
            } catch {
                // Vector index is optional for small corpora; sequential scan still works.
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_knowledge_chunks_embedding_hnsw"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_knowledge_chunks_embedding"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ai_knowledge_chunks_scope_hash"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_knowledge_chunks_org_source"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_knowledge_chunks"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_daily_reports_org_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_ai_daily_reports_org_date"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ai_daily_reports"`);
        await queryRunner.query(`
            ALTER TABLE "ai_org_quotas"
            DROP COLUMN IF EXISTS "notification_group_ids",
            DROP COLUMN IF EXISTS "daily_intelligence_enabled",
            DROP COLUMN IF EXISTS "tier"
        `);
    }
}
