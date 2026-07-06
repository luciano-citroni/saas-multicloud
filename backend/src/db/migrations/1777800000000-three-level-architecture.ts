import { MigrationInterface, QueryRunner } from 'typeorm';

export class ThreeLevelArchitecture1777800000000 implements MigrationInterface {
    name = 'ThreeLevelArchitecture1777800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Create tenants table (formerly organizations) ────────────────────
        await queryRunner.query(`
            CREATE TABLE "tenants" (
                "id"                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name"                VARCHAR(100) NOT NULL,
                "cnpj"                VARCHAR(20),
                "max_cloud_accounts"  INTEGER NOT NULL DEFAULT 0,
                "max_users"           INTEGER NOT NULL DEFAULT 0,
                "plans"               TEXT NOT NULL DEFAULT '',
                "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"          TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        // Copy all existing organizations into tenants (same IDs).
        // max_cloud_accounts / max_users / plans use defaults — they may not exist in all envs
        // and are managed by the billing service going forward.
        await queryRunner.query(`
            INSERT INTO "tenants" ("id", "name", "cnpj", "max_cloud_accounts", "max_users", "plans", "created_at", "updated_at")
            SELECT "id", "name", "cnpj", 0, 0, '', "created_at", "updated_at"
            FROM "organizations"
        `);

        // Unique partial index on cnpj (non-null only)
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_tenants_cnpj_not_null"
            ON "tenants" ("cnpj")
            WHERE cnpj IS NOT NULL
        `);

        // ── 2. Create tenant_members table (formerly organization_members) ──────
        await queryRunner.query(`
            CREATE TABLE "tenant_members" (
                "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "tenant_id"  UUID NOT NULL,
                "user_id"    UUID NOT NULL,
                "role"       VARCHAR(50) NOT NULL,
                "joined_at"  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_tenant_members_tenant_id"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_tenant_members_user_id"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "CHK_tenant_members_role"
                    CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'))
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_tenant_members_user_tenant"
            ON "tenant_members" ("user_id", "tenant_id")
        `);

        // Copy existing memberships
        await queryRunner.query(`
            INSERT INTO "tenant_members" ("id", "tenant_id", "user_id", "role", "joined_at", "created_at", "updated_at")
            SELECT "id", "organization_id", "user_id", "role", "joined_at", "created_at", "updated_at"
            FROM "organization_members"
        `);

        // ── 3. Create tenant_invites table (formerly organization_invites) ──────
        await queryRunner.query(`
            CREATE TABLE "tenant_invites" (
                "id"                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "tenant_id"           UUID NOT NULL,
                "email"               VARCHAR(255) NOT NULL,
                "role"                VARCHAR(50) NOT NULL,
                "token"               UUID NOT NULL UNIQUE,
                "status"              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                "invited_by_user_id"  UUID,
                "expires_at"          TIMESTAMP NOT NULL,
                "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_tenant_invites_tenant_id"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_tenant_invites_invited_by"
                    FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // Copy existing invites
        await queryRunner.query(`
            INSERT INTO "tenant_invites" ("id", "tenant_id", "email", "role", "token", "status", "invited_by_user_id", "expires_at", "created_at", "updated_at")
            SELECT "id", "organization_id", "email", "role", "token", "status", "invited_by_user_id", "expires_at", "created_at", "updated_at"
            FROM "organization_invites"
        `);

        // ── 4. Create new mid-level organizations table ──────────────────────────
        await queryRunner.query(`
            CREATE TABLE "organizations_new" (
                "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name"       VARCHAR(100) NOT NULL,
                "tenant_id"  UUID NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_organizations_new_tenant_id"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_organizations_new_tenant_id"
            ON "organizations_new" ("tenant_id")
        `);

        // ── 5. Seed: one default organization per tenant ─────────────────────────
        await queryRunner.query(`
            INSERT INTO "organizations_new" ("name", "tenant_id", "created_at", "updated_at")
            SELECT "name", "id", NOW(), NOW()
            FROM "tenants"
        `);

        // ── 6. Update cloud_accounts ──────────────────────────────────────────────
        // Drop the old FK pointing to organizations (now tenants)
        await queryRunner.query(`ALTER TABLE "cloud_accounts" DROP CONSTRAINT IF EXISTS "FK_cloud_accounts_organization_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cloud_accounts_organization_id"`);

        // Rename old organization_id → tenant_id
        await queryRunner.query(`ALTER TABLE "cloud_accounts" RENAME COLUMN "organization_id" TO "tenant_id"`);

        // Add FK for tenant_id → tenants
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD CONSTRAINT "FK_cloud_accounts_tenant_id"
            FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`CREATE INDEX "IDX_cloud_accounts_tenant_id" ON "cloud_accounts" ("tenant_id")`);

        // Add new organization_id column (mid-level org FK) — nullable initially
        await queryRunner.query(`ALTER TABLE "cloud_accounts" ADD COLUMN "organization_id" UUID`);

        // Fill organization_id with the default org created per tenant
        await queryRunner.query(`
            UPDATE "cloud_accounts" ca
            SET "organization_id" = (
                SELECT o."id"
                FROM "organizations_new" o
                WHERE o."tenant_id" = ca."tenant_id"
                LIMIT 1
            )
        `);

        // Make organization_id NOT NULL and add FK
        await queryRunner.query(`ALTER TABLE "cloud_accounts" ALTER COLUMN "organization_id" SET NOT NULL`);
        await queryRunner.query(`
            ALTER TABLE "cloud_accounts"
            ADD CONSTRAINT "FK_cloud_accounts_organization_id"
            FOREIGN KEY ("organization_id") REFERENCES "organizations_new"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`CREATE INDEX "IDX_cloud_accounts_organization_id" ON "cloud_accounts" ("organization_id")`);

        // ── 7. Update organization_subscriptions (may not exist in all envs) ───────
        const [orgSubExists] = await queryRunner.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'organization_subscriptions'
        `);

        if (orgSubExists) {
            await queryRunner.query(`ALTER TABLE "organization_subscriptions" DROP CONSTRAINT IF EXISTS "FK_organization_subscriptions_organization"`);
            await queryRunner.query(`ALTER TABLE "organization_subscriptions" DROP CONSTRAINT IF EXISTS "UQ_organization_subscriptions_org"`);
            await queryRunner.query(`DROP INDEX IF EXISTS "IDX_org_subscriptions_organization_id"`);

            // Rename organization_id → tenant_id
            await queryRunner.query(`ALTER TABLE "organization_subscriptions" RENAME COLUMN "organization_id" TO "tenant_id"`);
            await queryRunner.query(`
                ALTER TABLE "organization_subscriptions"
                ADD CONSTRAINT "UQ_organization_subscriptions_tenant" UNIQUE ("tenant_id")
            `);
            await queryRunner.query(`
                ALTER TABLE "organization_subscriptions"
                ADD CONSTRAINT "FK_organization_subscriptions_tenant"
                FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
            `);
            await queryRunner.query(`CREATE INDEX "IDX_org_subscriptions_tenant_id" ON "organization_subscriptions" ("tenant_id")`);
        }

        // ── 8. Drop old tables and rename organizations_new → organizations ──────
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_invites"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_members"`);
        // CASCADE drops any remaining FK constraints pointing to the old organizations table
        // (e.g. old cloud_accounts FK with auto-generated name, automation_execution FK)
        await queryRunner.query(`DROP TABLE "organizations" CASCADE`);
        await queryRunner.query(`ALTER TABLE "organizations_new" RENAME TO "organizations"`);

        // Rename constraints to final names
        await queryRunner.query(`ALTER INDEX "IDX_organizations_new_tenant_id" RENAME TO "IDX_organizations_tenant_id"`);
        await queryRunner.query(`
            ALTER TABLE "organizations"
            RENAME CONSTRAINT "FK_organizations_new_tenant_id" TO "FK_organizations_tenant_id"
        `);

        // Re-add automation_execution FK — organization_id held old org IDs which are now tenant IDs
        await queryRunner.query(`
            ALTER TABLE "automation_execution"
            ADD CONSTRAINT "fk_automation_execution_org"
            FOREIGN KEY ("organization_id") REFERENCES "tenants"("id") ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse: restore old structure
        // Note: data seeded for mid-level organizations will be lost

        // ── Restore organization_subscriptions ───────────────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_org_subscriptions_tenant_id"`);
        await queryRunner.query(`ALTER TABLE "organization_subscriptions" DROP CONSTRAINT IF EXISTS "FK_organization_subscriptions_tenant"`);
        await queryRunner.query(`ALTER TABLE "organization_subscriptions" DROP CONSTRAINT IF EXISTS "UQ_organization_subscriptions_tenant"`);
        await queryRunner.query(`ALTER TABLE "organization_subscriptions" RENAME COLUMN "tenant_id" TO "organization_id"`);

        // ── Restore cloud_accounts ───────────────────────────────────────────────
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cloud_accounts_organization_id"`);
        await queryRunner.query(`ALTER TABLE "cloud_accounts" DROP CONSTRAINT IF EXISTS "FK_cloud_accounts_organization_id"`);
        await queryRunner.query(`ALTER TABLE "cloud_accounts" DROP COLUMN "organization_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cloud_accounts_tenant_id"`);
        await queryRunner.query(`ALTER TABLE "cloud_accounts" DROP CONSTRAINT IF EXISTS "FK_cloud_accounts_tenant_id"`);
        await queryRunner.query(`ALTER TABLE "cloud_accounts" RENAME COLUMN "tenant_id" TO "organization_id"`);

        // ── Restore old organizations table ─────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "organizations" (
                "id"                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name"               VARCHAR(100) NOT NULL,
                "cnpj"               VARCHAR(20),
                "max_cloud_accounts" INTEGER NOT NULL DEFAULT 0,
                "max_users"          INTEGER NOT NULL DEFAULT 0,
                "plans"              TEXT[] NOT NULL DEFAULT '{}',
                "created_at"         TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"         TIMESTAMP NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`INSERT INTO "organizations" SELECT "id", "name", "cnpj", "max_cloud_accounts", "max_users", string_to_array("plans", ','), "created_at", "updated_at" FROM "tenants"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_organizations_cnpj_not_null" ON "organizations" ("cnpj") WHERE cnpj IS NOT NULL`);

        // Restore cloud_accounts FK to organizations
        await queryRunner.query(`ALTER TABLE "cloud_accounts" ADD CONSTRAINT "FK_cloud_accounts_organization_id" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`);
        await queryRunner.query(`CREATE INDEX "IDX_cloud_accounts_organization_id" ON "cloud_accounts" ("organization_id")`);

        // Restore automation_execution FK to organizations
        await queryRunner.query(`ALTER TABLE "automation_execution" DROP CONSTRAINT IF EXISTS "fk_automation_execution_org"`);
        await queryRunner.query(`ALTER TABLE "automation_execution" ADD CONSTRAINT "fk_automation_execution_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`);

        // Restore organization_subscriptions FK to organizations (only if it exists)
        const [orgSubExistsDown] = await queryRunner.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'organization_subscriptions'
        `);
        if (orgSubExistsDown) {
            await queryRunner.query(`ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "UQ_organization_subscriptions_org" UNIQUE ("organization_id")`);
            await queryRunner.query(`ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "FK_organization_subscriptions_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE`);
            await queryRunner.query(`CREATE INDEX "IDX_org_subscriptions_organization_id" ON "organization_subscriptions" ("organization_id")`);
        }

        // ── Restore organization_members ─────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "organization_members" (
                "id"              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "organization_id" UUID NOT NULL,
                "user_id"         UUID NOT NULL,
                "role"            VARCHAR(50) NOT NULL,
                "joined_at"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"      TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_org_members_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_org_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "CHK_org_members_role" CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'))
            )
        `);
        await queryRunner.query(`INSERT INTO "organization_members" SELECT "id", "tenant_id", "user_id", "role", "joined_at", "created_at", "updated_at" FROM "tenant_members"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_org_members_user_org" ON "organization_members" ("user_id", "organization_id")`);

        // ── Restore organization_invites ──────────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "organization_invites" (
                "id"                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "organization_id"     UUID NOT NULL,
                "email"               VARCHAR(255) NOT NULL,
                "role"                VARCHAR(50) NOT NULL,
                "token"               UUID NOT NULL UNIQUE,
                "status"              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                "invited_by_user_id"  UUID,
                "expires_at"          TIMESTAMP NOT NULL,
                "created_at"          TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at"          TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "FK_org_invites_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_org_invites_invited_by" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`INSERT INTO "organization_invites" SELECT "id", "tenant_id", "email", "role", "token", "status", "invited_by_user_id", "expires_at", "created_at", "updated_at" FROM "tenant_invites"`);

        // ── Drop new tables ───────────────────────────────────────────────────────
        await queryRunner.query(`DROP TABLE "organizations" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tenant_invites"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tenant_members"`);
        await queryRunner.query(`DROP TABLE "tenants" CASCADE`);
    }
}
