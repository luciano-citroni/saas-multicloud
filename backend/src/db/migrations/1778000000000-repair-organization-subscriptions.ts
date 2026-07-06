import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairOrganizationSubscriptions1778000000000 implements MigrationInterface {
    name = 'RepairOrganizationSubscriptions1778000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "tenant_id" uuid NOT NULL,
                "stripe_customer_id" character varying(255) NOT NULL,
                "stripe_subscription_id" character varying(255),
                "stripe_price_id" character varying(255),
                "stripe_product_id" character varying(255),
                "status" character varying(50) NOT NULL DEFAULT 'incomplete',
                "current_period_start" TIMESTAMP,
                "current_period_end" TIMESTAMP,
                "cancel_at_period_end" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_organization_subscriptions" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'organization_subscriptions'
                      AND column_name = 'organization_id'
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'organization_subscriptions'
                      AND column_name = 'tenant_id'
                ) THEN
                    EXECUTE 'ALTER TABLE "organization_subscriptions" RENAME COLUMN "organization_id" TO "tenant_id"';
                END IF;
            END
            $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'UQ_organization_subscriptions_tenant'
                ) THEN
                    ALTER TABLE "organization_subscriptions"
                    ADD CONSTRAINT "UQ_organization_subscriptions_tenant" UNIQUE ("tenant_id");
                END IF;
            END
            $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'UQ_organization_subscriptions_customer'
                ) THEN
                    ALTER TABLE "organization_subscriptions"
                    ADD CONSTRAINT "UQ_organization_subscriptions_customer" UNIQUE ("stripe_customer_id");
                END IF;
            END
            $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'UQ_organization_subscriptions_subscription'
                ) THEN
                    ALTER TABLE "organization_subscriptions"
                    ADD CONSTRAINT "UQ_organization_subscriptions_subscription" UNIQUE ("stripe_subscription_id");
                END IF;
            END
            $$;
        `);

        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'FK_organization_subscriptions_tenant'
                ) THEN
                    ALTER TABLE "organization_subscriptions"
                    ADD CONSTRAINT "FK_organization_subscriptions_tenant"
                    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
                END IF;
            END
            $$;
        `);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_org_subscriptions_tenant_id" ON "organization_subscriptions" ("tenant_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_org_subscriptions_stripe_customer_id" ON "organization_subscriptions" ("stripe_customer_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_org_subscriptions_status" ON "organization_subscriptions" ("status")`);

        await queryRunner.query(`
            INSERT INTO "organization_subscriptions" (
                "tenant_id",
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
            SELECT DISTINCT ON (tm.tenant_id)
                tm.tenant_id,
                us.stripe_customer_id,
                us.stripe_subscription_id,
                us.stripe_price_id,
                us.stripe_product_id,
                us.status,
                us.current_period_start,
                us.current_period_end,
                us.cancel_at_period_end,
                now(),
                now()
            FROM "tenant_members" tm
            INNER JOIN "user_subscriptions" us ON us.user_id = tm.user_id
            WHERE tm.role = 'OWNER'
              AND NOT EXISTS (
                  SELECT 1
                  FROM "organization_subscriptions" os
                  WHERE os.tenant_id = tm.tenant_id
                     OR os.stripe_customer_id = us.stripe_customer_id
                     OR (us.stripe_subscription_id IS NOT NULL AND os.stripe_subscription_id = us.stripe_subscription_id)
              )
            ORDER BY tm.tenant_id, us.updated_at DESC
                        ON CONFLICT DO NOTHING
        `);
    }

    public async down(): Promise<void> {
        // No-op: this migration repairs production data/model drift and should not drop subscription data.
    }
}
