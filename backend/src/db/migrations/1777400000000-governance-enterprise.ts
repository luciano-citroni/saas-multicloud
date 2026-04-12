import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Governance Enterprise Upgrade
 *
 * Changes:
 * 1. Adds `category` column to governance_findings (for category-based scoring)
 * 2. Adds `severity` index to governance_findings (for faster score queries)
 * 3. Creates governance_suppressions table (false positive management)
 */
export class GovernanceEnterprise1777400000000 implements MigrationInterface {
    name = 'GovernanceEnterprise1777400000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Add category column to governance_findings ──────────────────
        await queryRunner.query(`
            ALTER TABLE "governance_findings"
            ADD COLUMN IF NOT EXISTS "category" VARCHAR(30) NULL
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_governance_findings_category"
            ON "governance_findings" ("category")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_governance_findings_severity"
            ON "governance_findings" ("severity")
        `);

        // ── 2. Create governance_suppressions table ────────────────────────
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "governance_suppressions" (
                "id"               UUID        NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id"  UUID        NOT NULL,
                "cloud_account_id" UUID        NULL,
                "policy_id"        VARCHAR(100) NOT NULL DEFAULT '*',
                "resource_id"      VARCHAR(512) NULL,
                "reason"           TEXT         NOT NULL,
                "expires_at"       TIMESTAMP    NULL,
                "created_at"       TIMESTAMP   NOT NULL DEFAULT NOW(),
                "updated_at"       TIMESTAMP   NOT NULL DEFAULT NOW(),
                CONSTRAINT "PK_governance_suppressions" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_governance_suppressions_org_id"
            ON "governance_suppressions" ("organization_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_governance_suppressions_account_id"
            ON "governance_suppressions" ("cloud_account_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_governance_suppressions_policy_id"
            ON "governance_suppressions" ("policy_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_governance_suppressions_policy_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_governance_suppressions_account_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_governance_suppressions_org_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "governance_suppressions"`);

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_governance_findings_severity"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_governance_findings_category"`);
        await queryRunner.query(`ALTER TABLE "governance_findings" DROP COLUMN IF EXISTS "category"`);
    }
}
