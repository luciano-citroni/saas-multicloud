import { MigrationInterface, QueryRunner } from 'typeorm';

export class CloudIntelligenceWorkQueue1781100000000 implements MigrationInterface {
    name = 'CloudIntelligenceWorkQueue1781100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations"
            ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations"
            ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations"
            ADD COLUMN IF NOT EXISTS "acknowledged_by_user_id" uuid NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations"
            ADD COLUMN IF NOT EXISTS "dismiss_reason" varchar(255) NULL
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                ALTER TABLE "ai_recommendations"
                ADD CONSTRAINT "FK_ai_recommendations_assignee_user"
                FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                ALTER TABLE "ai_recommendations"
                ADD CONSTRAINT "FK_ai_recommendations_ack_user"
                FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_ai_recommendations_org_assignee"
            ON "ai_recommendations" ("organization_id", "assignee_user_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ai_recommendations_org_assignee"`);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP CONSTRAINT IF EXISTS "FK_ai_recommendations_ack_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP CONSTRAINT IF EXISTS "FK_ai_recommendations_assignee_user"
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP COLUMN IF EXISTS "dismiss_reason"
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP COLUMN IF EXISTS "acknowledged_by_user_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP COLUMN IF EXISTS "acknowledged_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP COLUMN IF EXISTS "assignee_user_id"
        `);
    }
}
