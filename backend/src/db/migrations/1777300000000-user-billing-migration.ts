import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrates billing from organization-level to user-level.
 *
 * Steps:
 *   1. Create user_subscriptions table (1:1 with users).
 *   2. Seed it from organization_subscriptions — each org owner gets their org's subscription.
 *   3. Drop plan-snapshot columns from organizations (max_cloud_accounts, max_users, plans).
 *   4. Drop organization_subscriptions table.
 */
export class UserBillingMigration1777300000000 implements MigrationInterface {
    name = 'UserBillingMigration1777300000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Create user_subscriptions ──────────────────────────────────────
        await queryRunner.query(`
            CREATE TABLE "user_subscriptions" (
                "id"                      UUID              NOT NULL DEFAULT uuid_generate_v4(),
                "user_id"                 UUID              NOT NULL,
                "stripe_customer_id"      VARCHAR(255)      NOT NULL,
                "stripe_subscription_id"  VARCHAR(255)      UNIQUE,
                "stripe_price_id"         VARCHAR(255),
                "stripe_product_id"       VARCHAR(255),
                "status"                  VARCHAR(50)       NOT NULL DEFAULT 'incomplete',
                "current_period_start"    TIMESTAMP,
                "current_period_end"      TIMESTAMP,
                "cancel_at_period_end"    BOOLEAN           NOT NULL DEFAULT false,
                "created_at"              TIMESTAMP         NOT NULL DEFAULT now(),
                "updated_at"              TIMESTAMP         NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_user_subscriptions_user_id"            UNIQUE ("user_id"),
                CONSTRAINT "UQ_user_subscriptions_stripe_customer_id" UNIQUE ("stripe_customer_id"),
                CONSTRAINT "PK_user_subscriptions"                    PRIMARY KEY ("id"),
                CONSTRAINT "FK_user_subscriptions_user"
                    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // ── 2. Seed from organization_subscriptions (owner-first, skip duplicates) ──
        // For each org subscription, find the OWNER member and create a user subscription.
        // If a user owns multiple orgs we pick the one with the most recent subscription.
        await queryRunner.query(`
            INSERT INTO "user_subscriptions" (
                "user_id",
                "stripe_customer_id",
                "stripe_subscription_id",
                "stripe_price_id",
                "stripe_product_id",
                "status",
                "current_period_start",
                "current_period_end",
                "cancel_at_period_end",
                "created_at",
                "updated_at"
            )
            SELECT DISTINCT ON (om.user_id)
                om.user_id,
                os.stripe_customer_id,
                os.stripe_subscription_id,
                os.stripe_price_id,
                os.stripe_product_id,
                os.status,
                os.current_period_start,
                os.current_period_end,
                os.cancel_at_period_end,
                os.created_at,
                os.updated_at
            FROM organization_subscriptions os
            JOIN organization_members om
              ON om.organization_id = os.organization_id
             AND om.role = 'OWNER'
            ORDER BY om.user_id, os.created_at DESC
            ON CONFLICT ("user_id") DO NOTHING
        `);

        // ── 3. Drop plan-snapshot columns from organizations ─────────────────
        await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "max_cloud_accounts"`);
        await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "max_users"`);
        await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "plans"`);

        // ── 4. Drop legacy organization_subscriptions table ──────────────────
        await queryRunner.query(`DROP TABLE IF EXISTS "organization_subscriptions"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Recreate organization_subscriptions
        await queryRunner.query(`
            CREATE TABLE "organization_subscriptions" (
                "id"                      UUID              NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id"         UUID              NOT NULL,
                "stripe_customer_id"      VARCHAR(255)      NOT NULL,
                "stripe_subscription_id"  VARCHAR(255)      UNIQUE,
                "stripe_price_id"         VARCHAR(255),
                "stripe_product_id"       VARCHAR(255),
                "status"                  VARCHAR(50)       NOT NULL DEFAULT 'incomplete',
                "current_period_start"    TIMESTAMP,
                "current_period_end"      TIMESTAMP,
                "cancel_at_period_end"    BOOLEAN           NOT NULL DEFAULT false,
                "created_at"              TIMESTAMP         NOT NULL DEFAULT now(),
                "updated_at"              TIMESTAMP         NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_org_subscriptions_org_id"              UNIQUE ("organization_id"),
                CONSTRAINT "UQ_org_subscriptions_stripe_customer_id"  UNIQUE ("stripe_customer_id"),
                CONSTRAINT "PK_organization_subscriptions"            PRIMARY KEY ("id"),
                CONSTRAINT "FK_organization_subscriptions_org"
                    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
            )
        `);

        // Restore plan columns on organizations
        await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "max_cloud_accounts" INTEGER NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "max_users" INTEGER NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "organizations" ADD COLUMN "plans" TEXT[] NOT NULL DEFAULT '{}'`);

        // Drop new table
        await queryRunner.query(`DROP TABLE IF EXISTS "user_subscriptions"`);
    }
}
